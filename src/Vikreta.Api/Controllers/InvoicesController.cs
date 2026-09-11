using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vikreta.Api.Domain;
using Vikreta.Api.DTOs;
using Vikreta.Api.Infrastructure;
using Vikreta.Api.Services;

namespace Vikreta.Api.Controllers;

[ApiController]
[Route("api/invoices")]
[Authorize]
public class InvoicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IInventoryService _inventory;
    private readonly ITenantContext _tenant;

    public InvoicesController(AppDbContext db, IInventoryService inventory, ITenantContext tenant)
    {
        _db = db;
        _inventory = inventory;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? locationId,
        [FromQuery] InvoiceStatus? status,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var query = _db.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Location)
            .AsQueryable();

        if (locationId.HasValue) query = query.Where(i => i.LocationId == locationId.Value);
        if (status.HasValue) query = query.Where(i => i.Status == status.Value);
        if (from.HasValue) query = query.Where(i => i.IssuedAt >= from.Value.Date);
        if (to.HasValue)
        {
            var endOfDay = to.Value.Date.AddDays(1);
            query = query.Where(i => i.IssuedAt < endOfDay);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(i => i.IssuedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return Ok(new PagedResult<InvoiceSummaryDto>(
            items.Select(i => new InvoiceSummaryDto(
                i.Id, i.InvoiceNumber, i.CustomerId, i.Customer?.Name,
                i.IssuedAt, i.GrandTotal, i.Status.ToString(), i.Customer?.Phone)).ToList(),
            total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var invoice = await GetFullInvoice(id, ct);
        return invoice == null ? NotFound() : Ok(MapInvoice(invoice));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateInvoiceRequest request, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Build lines with price/tax snapshots
        var lines = new List<InvoiceLine>();
        foreach (var lineReq in request.Lines)
        {
            var product = await _db.Products
                .Include(p => p.Variants)
                .FirstOrDefaultAsync(p => p.Id == lineReq.ProductId, ct);

            if (product == null)
                return BadRequest(new { error = $"Product {lineReq.ProductId} not found." });

            var variant = lineReq.VariantId.HasValue
                ? product.Variants.FirstOrDefault(v => v.Id == lineReq.VariantId.Value)
                : null;

            var unitPrice = lineReq.UnitPriceOverride
                ?? variant?.PriceOverride
                ?? product.DefaultPrice;

            var lineTotal = (unitPrice * lineReq.Quantity) - lineReq.LineDiscount;

            lines.Add(new InvoiceLine
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                VariantId = lineReq.VariantId,
                ProductNameSnapshot = product.Name,
                VariantAttributeSnapshot = variant?.AttributeSummary ?? "",
                Quantity = lineReq.Quantity,
                UnitPriceSnapshot = unitPrice,
                TaxRateSnapshot = product.TaxRate,
                LineDiscount = lineReq.LineDiscount,
                LineTotal = lineTotal
            });
        }

        var subtotal = lines.Sum(l => l.LineTotal);
        var taxTotal = lines.Sum(l => l.LineTotal * l.TaxRateSnapshot);
        var grandTotal = subtotal + taxTotal;

        // Generate invoice number: LOC-YYYYMMDD-SEQ
        var location = await _db.Locations.FindAsync(new object[] { request.LocationId }, ct);
        var todayStr = DateTime.UtcNow.ToString("yyyyMMdd");
        var todayCount = await _db.Invoices
            .CountAsync(i => i.LocationId == request.LocationId &&
                             i.IssuedAt.Date == DateTime.UtcNow.Date, ct);
        var invoiceNumber = $"{location?.Name?[..3].ToUpper() ?? "INV"}-{todayStr}-{(todayCount + 1):D4}";

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.TenantId,
            LocationId = request.LocationId,
            CustomerId = request.CustomerId,
            InvoiceNumber = invoiceNumber,
            IssuedAt = DateTime.UtcNow,
            Subtotal = subtotal,
            TaxTotal = taxTotal,
            DiscountTotal = lines.Sum(l => l.LineDiscount),
            GrandTotal = grandTotal,
            Status = InvoiceStatus.Draft,
            Notes = request.Notes,
            CreatedByUserId = userId,
            Lines = lines
        };

        _db.Invoices.Add(invoice);

        // Deduct redeemed loyalty points if any
        if (request.PointsRedeemed > 0 && request.CustomerId.HasValue)
        {
            var customer = await _db.Customers.FindAsync(new object[] { request.CustomerId.Value }, ct);
            if (customer != null)
            {
                customer.LoyaltyPoints = Math.Max(0, customer.LoyaltyPoints - request.PointsRedeemed);
            }
        }

        await _db.SaveChangesAsync(ct);

        // Deduct stock for all lines
        foreach (var line in lines)
        {
            var product = await _db.Products.FindAsync(new object[] { line.ProductId }, ct);
            if (product?.TracksInventory == true)
            {
                await _inventory.RecordTransactionAsync(
                    _tenant.TenantId, request.LocationId, line.ProductId, line.VariantId,
                    -line.Quantity, InventoryTransactionType.Sale, invoice.Id,
                    $"Sale: {invoice.InvoiceNumber}", userId, ct);
            }
        }

        // Mark as paid immediately if no payment needed (edge case)
        invoice.Status = InvoiceStatus.Draft; // caller adds payment separately
        await _db.SaveChangesAsync(ct);

        var created = await GetFullInvoice(invoice.Id, ct);
        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, MapInvoice(created!));
    }

    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] AddPaymentRequest request, CancellationToken ct)
    {
        var invoice = await GetFullInvoice(id, ct);
        if (invoice == null) return NotFound();
        if (invoice.Status == InvoiceStatus.Void) return BadRequest(new { error = "Cannot pay a voided invoice." });

        if (request.Method == PaymentMethod.StoreCredit)
        {
            if (!invoice.CustomerId.HasValue)
            {
                return BadRequest(new { error = "Store credit payment requires a customer." });
            }
            var customer = await _db.Customers.FindAsync(new object[] { invoice.CustomerId.Value }, ct);
            if (customer == null || customer.StoreCreditBalance < request.Amount)
            {
                return BadRequest(new { error = $"Insufficient store credit balance. Current balance: {customer?.StoreCreditBalance ?? 0:C2}" });
            }
            customer.StoreCreditBalance -= request.Amount;
        }

        var wasPaid = invoice.Status == InvoiceStatus.Paid;
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            InvoiceId = id,
            Amount = request.Amount,
            Method = request.Method,
            PaidAt = DateTime.UtcNow,
            ReferenceNumber = request.ReferenceNumber
        };
        _db.Payments.Add(payment);

        var totalPaid = invoice.Payments.Sum(p => p.Amount) + request.Amount;
        invoice.Status = totalPaid >= invoice.GrandTotal
            ? InvoiceStatus.Paid
            : InvoiceStatus.PartiallyPaid;

        // Earn loyalty points upon full payment
        if (!wasPaid && invoice.Status == InvoiceStatus.Paid && invoice.CustomerId.HasValue)
        {
            var settings = await _db.TenantSettings.FirstOrDefaultAsync(ct);
            if (settings?.LoyaltyEnabled == true)
            {
                var customer = await _db.Customers.FindAsync(new object[] { invoice.CustomerId.Value }, ct);
                if (customer != null)
                {
                    var earnRate = settings.LoyaltyPointsPerAmount > 0 ? settings.LoyaltyPointsPerAmount : 100m;
                    var pointsEarned = (int)Math.Floor(invoice.GrandTotal / earnRate);
                    if (pointsEarned > 0)
                    {
                        customer.LoyaltyPoints += pointsEarned;
                    }
                }
            }
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new PaymentDto(payment.Id, payment.Amount, payment.Method.ToString(), payment.PaidAt, payment.ReferenceNumber));
    }

    [HttpPost("{id:guid}/void")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Void(Guid id, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var invoice = await GetFullInvoice(id, ct);
        if (invoice == null) return NotFound();
        if (invoice.Status == InvoiceStatus.Void) return BadRequest(new { error = "Already voided." });

        // Reverse stock
        foreach (var line in invoice.Lines)
        {
            var product = await _db.Products.FindAsync(new object[] { line.ProductId }, ct);
            if (product?.TracksInventory == true)
            {
                await _inventory.RecordTransactionAsync(
                    _tenant.TenantId, invoice.LocationId, line.ProductId, line.VariantId,
                    line.Quantity, InventoryTransactionType.AdjustmentIncrease, invoice.Id,
                    $"Void: {invoice.InvoiceNumber}", userId, ct);
            }
        }

        invoice.Status = InvoiceStatus.Void;
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Invoice voided." });
    }

    [HttpGet("{id:guid}/returns")]
    public async Task<IActionResult> GetReturns(Guid id, CancellationToken ct)
    {
        var returns = await _db.InvoiceReturns
            .Include(r => r.ProcessedByUser)
            .Include(r => r.Lines)
                .ThenInclude(l => l.Product)
            .Where(r => r.InvoiceId == id)
            .OrderByDescending(r => r.ReturnedAt)
            .ToListAsync(ct);

        var dtos = returns.Select(r => new InvoiceReturnDto(
            r.Id,
            r.InvoiceId,
            r.ReturnNumber,
            r.ReturnedAt,
            r.TotalRefundAmount,
            r.RefundMethod.ToString(),
            r.Reason,
            r.ProcessedByUserId,
            r.ProcessedByUser != null ? $"{r.ProcessedByUser.FirstName} {r.ProcessedByUser.LastName}".Trim() : null,
            r.Lines.Select(l => new InvoiceReturnLineDto(
                l.Id,
                l.InvoiceLineId,
                l.ProductId,
                l.ProductNameSnapshot,
                l.Product != null ? l.Product.Sku : "",
                l.Quantity,
                l.RefundAmount,
                l.Restocked,
                r.Reason
            )).ToList()
        )).ToList();

        return Ok(dtos);
    }

    [HttpPost("{id:guid}/returns")]
    public async Task<IActionResult> CreateReturn(Guid id, [FromBody] CreateReturnRequest req, CancellationToken ct)
    {
        if (req.Items == null || req.Items.Count == 0)
            return BadRequest(new { message = "At least one item must be returned." });

        var invoice = await _db.Invoices
            .Include(i => i.Lines)
            .Include(i => i.Customer)
            .Include(i => i.Returns)
                .ThenInclude(r => r.Lines)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

        if (invoice == null)
            return NotFound(new { message = "Invoice not found." });

        if (invoice.Status == InvoiceStatus.Void)
            return BadRequest(new { message = "Cannot process returns on a voided invoice." });

        // Calculate already returned quantities per line
        var existingReturns = invoice.Returns.SelectMany(r => r.Lines).ToList();
        var returnedPerLine = existingReturns
            .GroupBy(l => l.InvoiceLineId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        PaymentMethod refundMethod = PaymentMethod.Cash;
        if (!string.IsNullOrWhiteSpace(req.RefundType))
        {
            if (Enum.TryParse<PaymentMethod>(req.RefundType, true, out var parsed))
                refundMethod = parsed;
        }

        if (refundMethod == PaymentMethod.StoreCredit && invoice.CustomerId == null)
        {
            return BadRequest(new { message = "Store credit refund requires a registered customer on the invoice." });
        }

        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var userId = Guid.TryParse(userIdClaim, out var uid) ? uid : invoice.CreatedByUserId;

        var returnEntity = new InvoiceReturn
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.TenantId,
            InvoiceId = invoice.Id,
            ReturnNumber = $"RET-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}",
            ReturnedAt = DateTime.UtcNow,
            RefundMethod = refundMethod,
            Reason = req.Reason ?? "Customer return",
            ProcessedByUserId = userId
        };

        decimal totalRefund = 0;
        var returnLines = new List<InvoiceReturnLine>();

        foreach (var item in req.Items)
        {
            if (item.Quantity <= 0)
                return BadRequest(new { message = "Return quantity must be greater than zero." });

            var invoiceLine = invoice.Lines.FirstOrDefault(l => l.Id == item.InvoiceLineId);
            if (invoiceLine == null)
                return BadRequest(new { message = $"Invoice line {item.InvoiceLineId} not found on this invoice." });

            var alreadyReturned = returnedPerLine.GetValueOrDefault(item.InvoiceLineId, 0);
            if (alreadyReturned + item.Quantity > invoiceLine.Quantity)
            {
                return BadRequest(new { message = $"Cannot return {item.Quantity} of {invoiceLine.ProductNameSnapshot}. Already returned: {alreadyReturned}, Original sold: {invoiceLine.Quantity}." });
            }

            // Update running tally
            returnedPerLine[item.InvoiceLineId] = alreadyReturned + item.Quantity;

            decimal lineRefundAmount = item.RefundAmount > 0
                ? item.RefundAmount
                : Math.Round((invoiceLine.LineTotal / invoiceLine.Quantity) * item.Quantity, 2);

            totalRefund += lineRefundAmount;

            var rLine = new InvoiceReturnLine
            {
                Id = Guid.NewGuid(),
                ReturnId = returnEntity.Id,
                InvoiceLineId = invoiceLine.Id,
                ProductId = invoiceLine.ProductId,
                VariantId = invoiceLine.VariantId,
                ProductNameSnapshot = invoiceLine.ProductNameSnapshot,
                Quantity = item.Quantity,
                UnitPriceSnapshot = invoiceLine.UnitPriceSnapshot,
                RefundAmount = lineRefundAmount,
                Restocked = item.RestockInventory
            };

            returnLines.Add(rLine);

            if (item.RestockInventory)
            {
                var product = await _db.Products.FindAsync(new object[] { invoiceLine.ProductId }, ct);
                if (product?.TracksInventory == true)
                {
                    await _inventory.RecordTransactionAsync(
                        _tenant.TenantId,
                        invoice.LocationId,
                        invoiceLine.ProductId,
                        invoiceLine.VariantId,
                        item.Quantity,
                        InventoryTransactionType.AdjustmentIncrease,
                        returnEntity.Id,
                        $"Return: {returnEntity.ReturnNumber}",
                        userId,
                        ct);
                }
            }
        }

        returnEntity.TotalRefundAmount = totalRefund;
        returnEntity.Lines = returnLines;

        // Apply Store Credit if requested
        if (refundMethod == PaymentMethod.StoreCredit && invoice.CustomerId.HasValue)
        {
            var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == invoice.CustomerId.Value, ct);
            if (customer != null)
            {
                customer.StoreCreditBalance += totalRefund;
            }
        }

        // Check if all lines are now completely returned
        bool allFullyReturned = invoice.Lines.All(l => returnedPerLine.GetValueOrDefault(l.Id, 0) >= l.Quantity);
        if (allFullyReturned)
        {
            invoice.Status = InvoiceStatus.Refunded;
        }

        _db.InvoiceReturns.Add(returnEntity);
        await _db.SaveChangesAsync(ct);

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        var staffName = user != null ? $"{user.FirstName} {user.LastName}".Trim() : null;

        var dto = new InvoiceReturnDto(
            returnEntity.Id,
            returnEntity.InvoiceId,
            returnEntity.ReturnNumber,
            returnEntity.ReturnedAt,
            returnEntity.TotalRefundAmount,
            returnEntity.RefundMethod.ToString(),
            returnEntity.Reason,
            returnEntity.ProcessedByUserId,
            staffName,
            returnLines.Select(l => new InvoiceReturnLineDto(
                l.Id,
                l.InvoiceLineId,
                l.ProductId,
                l.ProductNameSnapshot,
                "",
                l.Quantity,
                l.RefundAmount,
                l.Restocked,
                returnEntity.Reason
            )).ToList()
        );

        return Ok(dto);
    }

    [AllowAnonymous]
    [HttpGet("public/{id:guid}")]
    public async Task<IActionResult> GetPublicInvoice(Guid id, CancellationToken ct)
    {
        var invoice = await _db.Invoices
            .IgnoreQueryFilters()
            .Include(i => i.Location)
            .Include(i => i.Customer)
            .Include(i => i.Lines)
            .Include(i => i.Payments)
            .Include(i => i.Returns)
                .ThenInclude(r => r.Lines)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

        if (invoice == null) return NotFound(new { message = "Digital invoice not found." });

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == invoice.TenantId, ct);
        var settings = await _db.TenantSettings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.TenantId == invoice.TenantId, ct);

        var returnDtos = invoice.Returns?.Select(r => new InvoiceReturnDto(
            r.Id,
            r.InvoiceId,
            r.ReturnNumber,
            r.ReturnedAt,
            r.TotalRefundAmount,
            r.RefundMethod.ToString(),
            r.Reason,
            r.ProcessedByUserId,
            null,
            r.Lines.Select(rl => new InvoiceReturnLineDto(
                rl.Id,
                rl.InvoiceLineId,
                rl.ProductId,
                rl.ProductNameSnapshot,
                "",
                rl.Quantity,
                rl.RefundAmount,
                rl.Restocked,
                r.Reason
            )).ToList()
        )).ToList();

        var dto = new PublicInvoiceDto(
            invoice.Id,
            invoice.InvoiceNumber,
            tenant?.Name ?? "Vikreta Retail",
            invoice.Location?.Name ?? "Main Store",
            invoice.Location?.Address,
            invoice.Customer?.Name,
            invoice.Customer?.Phone,
            invoice.IssuedAt,
            invoice.Subtotal,
            invoice.TaxTotal,
            invoice.DiscountTotal,
            invoice.GrandTotal,
            invoice.Status.ToString(),
            settings?.ReceiptHeader ?? "",
            settings?.ReceiptFooter ?? "Thank you for shopping with us! Please visit again.",
            invoice.Lines.Select(l => new PublicInvoiceLineDto(
                l.ProductNameSnapshot,
                l.VariantAttributeSnapshot,
                l.Quantity,
                l.UnitPriceSnapshot,
                l.TaxRateSnapshot,
                l.LineDiscount,
                l.LineTotal
            )).ToList(),
            invoice.Payments.Select(p => new PaymentDto(
                p.Id, p.Amount, p.Method.ToString(), p.PaidAt, p.ReferenceNumber
            )).ToList(),
            returnDtos
        );

        return Ok(dto);
    }

    private async Task<Invoice?> GetFullInvoice(Guid id, CancellationToken ct) =>
        await _db.Invoices
            .Include(i => i.Location)
            .Include(i => i.Customer)
            .Include(i => i.Lines)
            .Include(i => i.Payments)
            .Include(i => i.Returns)
                .ThenInclude(r => r.Lines)
            .Include(i => i.Returns)
                .ThenInclude(r => r.ProcessedByUser)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

    private static InvoiceDto MapInvoice(Invoice i) => new(
        i.Id, i.InvoiceNumber, i.LocationId, i.Location.Name,
        i.CustomerId, i.Customer?.Name,
        i.IssuedAt, i.Subtotal, i.TaxTotal, i.DiscountTotal, i.GrandTotal, i.Status.ToString(), i.Notes,
        i.Lines.Select(l => new InvoiceLineDto(
            l.Id, l.ProductId, l.ProductNameSnapshot, l.VariantAttributeSnapshot,
            l.Quantity, l.UnitPriceSnapshot, l.TaxRateSnapshot, l.LineDiscount, l.LineTotal)).ToList(),
        i.Payments.Select(p => new PaymentDto(p.Id, p.Amount, p.Method.ToString(), p.PaidAt, p.ReferenceNumber)).ToList(),
        i.Returns?.Select(r => new InvoiceReturnDto(
            r.Id,
            r.InvoiceId,
            r.ReturnNumber,
            r.ReturnedAt,
            r.TotalRefundAmount,
            r.RefundMethod.ToString(),
            r.Reason,
            r.ProcessedByUserId,
            r.ProcessedByUser != null ? $"{r.ProcessedByUser.FirstName} {r.ProcessedByUser.LastName}".Trim() : null,
            r.Lines.Select(rl => new InvoiceReturnLineDto(
                rl.Id,
                rl.InvoiceLineId,
                rl.ProductId,
                rl.ProductNameSnapshot,
                "",
                rl.Quantity,
                rl.RefundAmount,
                rl.Restocked,
                r.Reason
            )).ToList()
        )).ToList(),
        i.Customer?.Phone);
}
