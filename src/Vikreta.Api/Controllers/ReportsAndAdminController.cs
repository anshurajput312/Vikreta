using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vikreta.Api.Domain;
using Vikreta.Api.DTOs;
using Vikreta.Api.Infrastructure;
using Vikreta.Api.Services;

namespace Vikreta.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize(Roles = "Owner,Manager")]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ReportsController(AppDbContext db) => _db = db;

    [HttpGet("sales")]
    public async Task<IActionResult> Sales(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        CancellationToken ct)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.Invoices
            .Include(i => i.Location)
            .Where(i => i.Status != InvoiceStatus.Void &&
                        i.IssuedAt >= fromDate && i.IssuedAt <= toDate);

        if (locationId.HasValue) query = query.Where(i => i.LocationId == locationId.Value);

        var invoices = await query
            .Select(i => new
            {
                Date = i.IssuedAt.Date,
                i.LocationId,
                LocationName = i.Location != null ? i.Location.Name : "Unknown",
                i.GrandTotal,
                i.TaxTotal
            })
            .ToListAsync(ct);

        var rows = invoices
            .GroupBy(i => new { i.Date, i.LocationId, i.LocationName })
            .Select(g => new SalesReportRow(
                g.Key.Date,
                g.Key.LocationId,
                g.Key.LocationName,
                g.Count(),
                g.Sum(i => i.GrandTotal),
                g.Sum(i => i.TaxTotal)))
            .OrderBy(r => r.Date)
            .ToList();

        return Ok(rows);
    }

    [HttpGet("stock-valuation")]
    public async Task<IActionResult> StockValuation([FromQuery] Guid? locationId, CancellationToken ct)
    {
        var query = _db.StockItems
            .Include(s => s.Product)
            .Include(s => s.Location)
            .Where(s => s.Product.IsActive && s.Product.TracksInventory);

        if (locationId.HasValue) query = query.Where(s => s.LocationId == locationId.Value);

        var rows = await query
            .OrderBy(s => s.Product.Name)
            .Select(s => new StockValuationRow(
                s.ProductId, s.Product.Name, s.Product.Sku,
                s.LocationId, s.Location.Name,
                s.QuantityOnHand, s.Product.DefaultCost,
                s.QuantityOnHand * s.Product.DefaultCost))
            .ToListAsync(ct);

        return Ok(rows);
    }

    [HttpGet("top-products")]
    public async Task<IActionResult> TopProducts(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        [FromQuery] int top = 20,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.InvoiceLines
            .Include(l => l.Invoice)
            .Include(l => l.Product)
            .Where(l => l.Invoice.Status != InvoiceStatus.Void &&
                        l.Invoice.IssuedAt >= fromDate && l.Invoice.IssuedAt <= toDate);

        if (locationId.HasValue)
        {
            query = query.Where(l => l.Invoice.LocationId == locationId.Value);
        }

        var lines = await query
            .Select(l => new
            {
                l.ProductId,
                l.ProductNameSnapshot,
                l.Quantity,
                l.LineTotal
            })
            .ToListAsync(ct);

        var rows = lines
            .GroupBy(l => new { l.ProductId, l.ProductNameSnapshot })
            .Select(g => new
            {
                ProductId = g.Key.ProductId,
                ProductName = g.Key.ProductNameSnapshot,
                UnitsSold = g.Sum(l => l.Quantity),
                Revenue = g.Sum(l => l.LineTotal)
            })
            .OrderByDescending(r => r.Revenue)
            .Take(top)
            .ToList();

        // Get current SKUs
        var productIds = rows.Select(r => r.ProductId).ToList();
        var skus = await _db.Products
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);

        var result = rows.Select((r, i) => new TopProductRow(
            r.ProductId, r.ProductName, skus.GetValueOrDefault(r.ProductId, ""),
            r.UnitsSold, r.Revenue, i + 1)).ToList();

        return Ok(result);
    }

    [HttpGet("tax-summary")]
    public async Task<IActionResult> TaxSummary(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.InvoiceLines
            .Where(l => l.Invoice.Status != InvoiceStatus.Void &&
                        l.Invoice.IssuedAt >= fromDate && l.Invoice.IssuedAt <= toDate);

        if (locationId.HasValue)
        {
            query = query.Where(l => l.Invoice.LocationId == locationId.Value);
        }

        var lines = await query
            .Select(l => new
            {
                l.TaxRateSnapshot,
                l.LineTotal
            })
            .ToListAsync(ct);

        var rows = lines
            .GroupBy(l => l.TaxRateSnapshot)
            .Select(g => new TaxSummaryRow(
                g.Key,
                g.Sum(l => l.LineTotal),
                g.Sum(l => l.LineTotal * g.Key)
            ))
            .OrderBy(r => r.TaxRate)
            .ToList();

        return Ok(rows);
    }

    [HttpGet("profit-margin")]
    public async Task<IActionResult> ProfitMargin(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        [FromQuery] Guid? categoryId,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.InvoiceLines
            .Include(l => l.Invoice)
                .ThenInclude(i => i.Location)
            .Include(l => l.Product)
                .ThenInclude(p => p.Category)
            .Where(l => l.Invoice.Status != InvoiceStatus.Void &&
                        l.Invoice.IssuedAt >= fromDate && l.Invoice.IssuedAt <= toDate);

        if (locationId.HasValue)
            query = query.Where(l => l.Invoice.LocationId == locationId.Value);

        if (categoryId.HasValue)
            query = query.Where(l => l.Product.CategoryId == categoryId.Value);

        var data = await query
            .Select(l => new
            {
                Date = l.Invoice.IssuedAt.Date,
                InvoiceId = l.InvoiceId,
                LocationId = l.Invoice.LocationId,
                LocationName = l.Invoice.Location != null ? l.Invoice.Location.Name : "Unknown",
                CategoryId = l.Product.CategoryId,
                CategoryName = l.Product.Category != null ? l.Product.Category.Name : "Uncategorized",
                Quantity = l.Quantity,
                LineTotal = l.LineTotal,
                UnitCost = l.Product.DefaultCost,
                LineCost = l.Quantity * l.Product.DefaultCost
            })
            .ToListAsync(ct);

        decimal totalRev = data.Sum(x => x.LineTotal);
        decimal totalCogs = data.Sum(x => x.LineCost);
        decimal totalGrossProfit = totalRev - totalCogs;
        decimal overallMargin = totalRev > 0 ? Math.Round((totalGrossProfit / totalRev) * 100m, 2) : 0m;

        // Daily breakdown
        var daily = data
            .GroupBy(x => new { x.Date, x.LocationId, x.LocationName })
            .Select(g =>
            {
                var rev = g.Sum(x => x.LineTotal);
                var cogs = g.Sum(x => x.LineCost);
                var gp = rev - cogs;
                var margin = rev > 0 ? Math.Round((gp / rev) * 100m, 2) : 0m;
                var invCount = g.Select(x => x.InvoiceId).Distinct().Count();
                var itemsSold = g.Sum(x => x.Quantity);
                return new ProfitMarginRowDto(
                    g.Key.Date, g.Key.LocationId, g.Key.LocationName,
                    rev, cogs, gp, margin, invCount, itemsSold);
            })
            .OrderBy(r => r.Date)
            .ToList();

        // Category breakdown
        var categories = data
            .GroupBy(x => x.CategoryName)
            .Select(g =>
            {
                var rev = g.Sum(x => x.LineTotal);
                var cogs = g.Sum(x => x.LineCost);
                var gp = rev - cogs;
                var margin = rev > 0 ? Math.Round((gp / rev) * 100m, 2) : 0m;
                var itemsSold = g.Sum(x => x.Quantity);
                return new CategoryMarginDto(g.Key, rev, cogs, gp, margin, itemsSold);
            })
            .OrderByDescending(c => c.Revenue)
            .ToList();

        // Location breakdown
        var locations = data
            .GroupBy(x => new { x.LocationId, x.LocationName })
            .Select(g =>
            {
                var rev = g.Sum(x => x.LineTotal);
                var cogs = g.Sum(x => x.LineCost);
                var gp = rev - cogs;
                var margin = rev > 0 ? Math.Round((gp / rev) * 100m, 2) : 0m;
                return new LocationMarginDto(g.Key.LocationId, g.Key.LocationName, rev, cogs, gp, margin);
            })
            .OrderByDescending(l => l.Revenue)
            .ToList();

        return Ok(new ProfitMarginReportDto(
            totalRev, totalCogs, totalGrossProfit, overallMargin,
            daily, categories, locations));
    }

    [HttpGet("hourly-rush")]
    public async Task<IActionResult> HourlyRush(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.Invoices
            .Where(i => i.Status != InvoiceStatus.Void &&
                        i.IssuedAt >= fromDate && i.IssuedAt <= toDate);

        if (locationId.HasValue)
            query = query.Where(i => i.LocationId == locationId.Value);

        var invoices = await query
            .Select(i => new
            {
                i.IssuedAt,
                i.GrandTotal
            })
            .ToListAsync(ct);

        string[] dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        var cells = new List<HourlyCellDto>();
        for (int d = 0; d < 7; d++)
        {
            for (int h = 0; h < 24; h++)
            {
                var matching = invoices.Where(i => (int)i.IssuedAt.DayOfWeek == d && i.IssuedAt.Hour == h).ToList();
                int count = matching.Count;
                decimal rev = matching.Sum(x => x.GrandTotal);
                decimal avgTicket = count > 0 ? Math.Round(rev / count, 2) : 0m;
                cells.Add(new HourlyCellDto(d, dayNames[d], h, count, rev, avgTicket));
            }
        }

        var hourlySummaries = new List<HourlySummaryDto>();
        for (int h = 0; h < 24; h++)
        {
            var matching = invoices.Where(i => i.IssuedAt.Hour == h).ToList();
            int count = matching.Count;
            decimal rev = matching.Sum(x => x.GrandTotal);
            decimal avgRev = count > 0 ? Math.Round(rev / count, 2) : 0m;
            int start12 = h % 12 == 0 ? 12 : h % 12;
            string ampm = h < 12 ? "AM" : "PM";
            string label = $"{start12} {ampm}";
            hourlySummaries.Add(new HourlySummaryDto(h, label, count, rev, avgRev));
        }

        var busiestDayGroup = invoices
            .GroupBy(i => (int)i.IssuedAt.DayOfWeek)
            .OrderByDescending(g => g.Count())
            .FirstOrDefault();
        string busiestDay = busiestDayGroup != null && invoices.Count > 0 ? dayNames[busiestDayGroup.Key] : "N/A";

        var busiestHourGroup = hourlySummaries
            .OrderByDescending(h => h.TotalInvoices)
            .FirstOrDefault();
        string busiestHour = busiestHourGroup != null && busiestHourGroup.TotalInvoices > 0
            ? busiestHourGroup.HourLabel
            : "N/A";

        return Ok(new HourlyRushReportDto(cells, hourlySummaries, busiestDay, busiestHour));
    }

    [HttpGet("cashier-performance")]
    public async Task<IActionResult> CashierPerformance(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? locationId,
        CancellationToken ct = default)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to.HasValue ? to.Value.Date.AddDays(1) : DateTime.UtcNow;

        var query = _db.Invoices
            .Include(i => i.CreatedBy)
            .Where(i => i.Status != InvoiceStatus.Void &&
                        i.IssuedAt >= fromDate && i.IssuedAt <= toDate);

        if (locationId.HasValue)
            query = query.Where(i => i.LocationId == locationId.Value);

        var invoices = await query
            .Select(i => new
            {
                i.CreatedByUserId,
                StaffName = i.CreatedBy != null ? $"{i.CreatedBy.FirstName} {i.CreatedBy.LastName}".Trim() : "Unknown Staff",
                Email = i.CreatedBy != null ? i.CreatedBy.Email : "",
                Role = i.CreatedBy != null ? i.CreatedBy.Role.ToString() : "Staff",
                i.GrandTotal,
                i.DiscountTotal,
                i.TaxTotal,
                i.IssuedAt
            })
            .ToListAsync(ct);

        var grouped = invoices
            .GroupBy(i => new { i.CreatedByUserId, i.StaffName, i.Email, i.Role })
            .Select(g =>
            {
                int count = g.Count();
                decimal totalSales = g.Sum(x => x.GrandTotal);
                decimal avgBill = count > 0 ? Math.Round(totalSales / count, 2) : 0m;
                decimal discountTotal = g.Sum(x => x.DiscountTotal);
                decimal taxTotal = g.Sum(x => x.TaxTotal);
                var first = g.Min(x => x.IssuedAt);
                var last = g.Max(x => x.IssuedAt);
                return new CashierPerformanceRowDto(
                    g.Key.CreatedByUserId,
                    g.Key.StaffName,
                    g.Key.Email,
                    g.Key.Role,
                    count,
                    totalSales,
                    avgBill,
                    discountTotal,
                    taxTotal,
                    first,
                    last
                );
            })
            .OrderByDescending(x => x.TotalSales)
            .ToList();

        decimal totalSalesAll = invoices.Sum(x => x.GrandTotal);
        int totalInvoicesAll = invoices.Count;
        decimal storeAvgBill = totalInvoicesAll > 0 ? Math.Round(totalSalesAll / totalInvoicesAll, 2) : 0m;

        return Ok(new CashierPerformanceReportDto(totalSalesAll, totalInvoicesAll, storeAvgBill, grouped));
    }
}

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IInventoryService _inventory;

    public DashboardController(AppDbContext db, IInventoryService inventory)
    {
        _db = db;
        _inventory = inventory;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] Guid? locationId, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var yesterday = today.AddDays(-1);

        var invoiceQuery = _db.Invoices.Include(i => i.Customer).Include(i => i.Location)
            .Where(i => i.Status != InvoiceStatus.Void);

        if (locationId.HasValue) invoiceQuery = invoiceQuery.Where(i => i.LocationId == locationId.Value);

        var todayInvoices = await invoiceQuery.Where(i => i.IssuedAt.Date == today).ToListAsync(ct);
        var yesterdayRevenue = await invoiceQuery
            .Where(i => i.IssuedAt.Date == yesterday)
            .SumAsync(i => i.GrandTotal, ct);

        var salesToday = todayInvoices.Sum(i => i.GrandTotal);
        var invoicesToday = todayInvoices.Count;
        var avgTicket = invoicesToday > 0 ? salesToday / invoicesToday : 0;
        var change = yesterdayRevenue > 0 ? (salesToday - yesterdayRevenue) / yesterdayRevenue : 0;

        // Recent invoices
        var recentInvoices = todayInvoices
            .OrderByDescending(i => i.IssuedAt)
            .Take(5)
            .Select(i => new InvoiceSummaryDto(i.Id, i.InvoiceNumber, i.CustomerId, i.Customer?.Name, i.IssuedAt, i.GrandTotal, i.Status.ToString()))
            .ToList();

        // Low stock
        List<StockItem> lowStockItems;
        if (locationId.HasValue)
        {
            lowStockItems = await _inventory.GetLowStockItemsAsync(locationId.Value, ct);
        }
        else
        {
            var locations = await _db.Locations.Where(l => l.IsActive).ToListAsync(ct);
            lowStockItems = new List<StockItem>();
            foreach (var loc in locations)
                lowStockItems.AddRange(await _inventory.GetLowStockItemsAsync(loc.Id, ct));
        }

        var lowStockDtos = lowStockItems.Take(5).Select(s => new StockItemDto(
            s.Id, s.LocationId, s.Location.Name,
            s.ProductId, s.Product.Name, s.Product.Sku,
            s.VariantId, s.Variant?.AttributeSummary,
            s.QuantityOnHand, s.ReorderPoint, s.ReorderQuantity,
            s.QuantityOnHand <= 0 ? "out" : "low")).ToList();

        return Ok(new DashboardSummaryDto(
            salesToday, change, invoicesToday, avgTicket,
            lowStockItems.Count, recentInvoices, lowStockDtos));
    }
}

[ApiController]
[Route("api/locations")]
[Authorize]
public class LocationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public LocationsController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var items = await _db.Locations.Where(l => l.IsActive).OrderBy(l => l.Name).ToListAsync(ct);
        return Ok(items.Select(l => new LocationDto(l.Id, l.Name, l.Address, l.TimeZone, l.IsActive)));
    }

    [HttpPost]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Create([FromBody] CreateLocationRequest request, CancellationToken ct)
    {
        var location = new Location
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.TenantId,
            Name = request.Name,
            Address = request.Address,
            TimeZone = request.TimeZone
        };
        _db.Locations.Add(location);
        await _db.SaveChangesAsync(ct);
        return Created("", new LocationDto(location.Id, location.Name, location.Address, location.TimeZone, location.IsActive));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateLocationRequest request, CancellationToken ct)
    {
        var loc = await _db.Locations.FindAsync(new object[] { id }, ct);
        if (loc == null) return NotFound();
        loc.Name = request.Name; loc.Address = request.Address; loc.TimeZone = request.TimeZone; loc.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);
        return Ok(new LocationDto(loc.Id, loc.Name, loc.Address, loc.TimeZone, loc.IsActive));
    }
}

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Owner")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;

    public AdminController(AppDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers(CancellationToken ct)
    {
        var users = await _db.Users.Where(u => u.IsActive).OrderBy(u => u.FirstName).ToListAsync(ct);
        return Ok(users.Select(u => new UserDto(u.Id, u.Email, u.FirstName, u.LastName, u.Role.ToString(), u.LocationId)));
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email.ToLowerInvariant(), ct))
            return Conflict(new { error = "Email already exists." });

        var user = new User
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.TenantId,
            Email = request.Email.ToLowerInvariant(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FirstName = request.FirstName,
            LastName = request.LastName,
            Role = request.Role,
            LocationId = request.LocationId,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return Created("", new UserDto(user.Id, user.Email, user.FirstName, user.LastName, user.Role.ToString(), user.LocationId));
    }

    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user == null) return NotFound();
        user.FirstName = request.FirstName; user.LastName = request.LastName;
        user.Role = request.Role; user.LocationId = request.LocationId; user.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);
        return Ok(new UserDto(user.Id, user.Email, user.FirstName, user.LastName, user.Role.ToString(), user.LocationId));
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var settings = await _db.TenantSettings.FirstOrDefaultAsync(ct);
        if (settings == null)
            return Ok(new TenantSettingsDto(0.08m, "INR", "", "Thank you for shopping with us!", "", true, 100m, 1.0m));
        return Ok(new TenantSettingsDto(
            settings.DefaultTaxRate, settings.CurrencyCode, settings.ReceiptHeader, settings.ReceiptFooter, settings.LogoUrl,
            settings.LoyaltyEnabled, settings.LoyaltyPointsPerAmount, settings.LoyaltyRedemptionRate));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateTenantSettingsRequest request, CancellationToken ct)
    {
        var settings = await _db.TenantSettings.FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            settings = new TenantSettings { Id = Guid.NewGuid(), TenantId = _tenant.TenantId };
            _db.TenantSettings.Add(settings);
        }
        settings.DefaultTaxRate = request.DefaultTaxRate;
        settings.CurrencyCode = request.CurrencyCode;
        settings.ReceiptHeader = request.ReceiptHeader;
        settings.ReceiptFooter = request.ReceiptFooter;
        settings.LogoUrl = request.LogoUrl;
        settings.LoyaltyEnabled = request.LoyaltyEnabled;
        settings.LoyaltyPointsPerAmount = request.LoyaltyPointsPerAmount;
        settings.LoyaltyRedemptionRate = request.LoyaltyRedemptionRate;
        await _db.SaveChangesAsync(ct);
        return Ok(new TenantSettingsDto(
            settings.DefaultTaxRate, settings.CurrencyCode, settings.ReceiptHeader, settings.ReceiptFooter, settings.LogoUrl,
            settings.LoyaltyEnabled, settings.LoyaltyPointsPerAmount, settings.LoyaltyRedemptionRate));
    }
}
