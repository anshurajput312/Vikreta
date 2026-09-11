import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Printer, 
  MessageCircle, 
  PhoneCall, 
  Copy, 
  Check, 
  CheckCircle2, 
  ShieldCheck, 
  Leaf, 
  ArrowLeft,
  Store,
  Calendar,
  User,
  CreditCard,
  RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { invoicesApi } from '../../api/client';
import { 
  formatWhatsAppReceipt, 
  buildWhatsAppLink, 
  formatSmsReceipt, 
  buildSmsLink,
  getDigitalInvoiceUrl 
} from '../../utils/whatsappReceipt';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const DigitalReceiptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-invoice', id],
    queryFn: () => invoicesApi.getPublic(id!),
    enabled: Boolean(id),
    retry: 1,
  });

  const invoice = data?.data;

  const handleCopyLink = () => {
    if (!id) return;
    const url = getDigitalInvoiceUrl(id);
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Digital receipt link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    if (!invoice || !id) return;
    const invoiceUrl = getDigitalInvoiceUrl(id);
    const text = formatWhatsAppReceipt({
      storeName: invoice.storeName,
      invoiceNumber: invoice.invoiceNumber,
      date: new Date(invoice.issuedAt).toLocaleDateString('en-IN', { 
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
      }),
      customerName: invoice.customerName,
      items: (invoice.lines || []).map((l: any) => ({
        name: l.productName + (l.variantAttribute ? ` (${l.variantAttribute})` : ''),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      taxTotal: invoice.taxTotal,
      grandTotal: invoice.grandTotal,
      paymentMethod: invoice.payments?.map((p: any) => p.method).join(', ') || undefined,
      storeAddress: invoice.locationAddress,
      invoiceUrl,
    });

    const url = buildWhatsAppLink(invoice.customerPhone, text);
    window.open(url, '_blank');
  };

  const handleShareSms = () => {
    if (!invoice || !id) return;
    const invoiceUrl = getDigitalInvoiceUrl(id);
    const text = formatSmsReceipt({
      storeName: invoice.storeName,
      invoiceNumber: invoice.invoiceNumber,
      date: new Date(invoice.issuedAt).toLocaleDateString('en-IN'),
      customerName: invoice.customerName,
      items: [],
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      grandTotal: invoice.grandTotal,
      invoiceUrl,
    });

    const url = buildSmsLink(invoice.customerPhone, text);
    window.location.href = url;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full border-4 border-teal border-t-transparent animate-spin mb-4" />
        <p className="font-mono text-sm text-ink-soft animate-pulse">Loading verified digital receipt…</p>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-cherry/10 text-cherry rounded-full flex items-center justify-center mb-4 text-2xl font-bold">
          !
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Digital Receipt Not Found</h1>
        <p className="text-sm text-ink-soft max-w-sm mb-6">
          This digital bill link may have expired or the invoice ID is invalid. Please contact the store cashier.
        </p>
        <Link to="/login" className="btn-secondary text-xs flex items-center gap-1.5">
          <ArrowLeft size={14} /> Go to Vikreta Login
        </Link>
      </div>
    );
  }

  const isPaid = invoice.status === 'Paid';
  const hasReturns = invoice.returns && invoice.returns.length > 0;
  const totalRefunded = invoice.returns?.reduce((s: number, r: any) => s + (r.totalRefundAmount || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-[#EDEBE6] py-6 px-3 sm:px-6 flex flex-col items-center justify-start print:bg-white print:p-0">
      
      {/* Top Action Floating Bar */}
      <div className="w-full max-w-lg mb-4 flex items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-dark bg-teal-light/70 px-2.5 py-1.5 rounded-lg border border-teal/30">
          <Leaf size={14} className="text-emerald-600" />
          <span>Paperless Digital Bill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyLink}
            className="bg-white hover:bg-paper-alt text-ink border border-line rounded-lg px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
            title="Copy digital receipt link"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Link'}</span>
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            title="Share via WhatsApp"
          >
            <MessageCircle size={14} />
            <span>WhatsApp</span>
          </button>
          <button
            onClick={handleShareSms}
            className="bg-ink hover:bg-ink-dark text-white rounded-lg px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 shadow-sm transition-colors"
            title="Share via SMS"
          >
            <PhoneCall size={13} />
            <span>SMS</span>
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white hover:bg-paper-alt text-ink border border-line rounded-lg px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
            title="Print or Save PDF"
          >
            <Printer size={13} />
          </button>
        </div>
      </div>

      {/* Main Digital Receipt Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-line/60 overflow-hidden print:shadow-none print:border-none print:max-w-none">
        
        {/* Receipt Header Banner */}
        <div className="bg-gradient-to-b from-[#241F1C] to-[#362E29] text-white p-6 text-center relative">
          <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/20 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase text-[#4EBAA8] mb-3">
            <ShieldCheck size={13} />
            <span>Official Verified Digital Receipt</span>
          </div>
          
          <h1 className="text-2xl font-black tracking-tight mb-1 text-[#FBF4E6]">
            {invoice.storeName}
          </h1>
          
          <p className="text-xs text-white/80 flex items-center justify-center gap-1.5">
            <Store size={12} />
            <span>{invoice.locationName}</span>
            {invoice.locationAddress && <span>• {invoice.locationAddress}</span>}
          </p>

          {invoice.receiptHeader && (
            <p className="text-[11px] text-white/60 italic mt-2 border-t border-white/10 pt-2">
              "{invoice.receiptHeader}"
            </p>
          )}

          {/* Scallop bottom pattern on header */}
          <div className="absolute -bottom-2 left-0 right-0 h-4 bg-white rounded-t-xl" />
        </div>

        {/* Invoice Key Meta Bar */}
        <div className="px-6 pt-2 pb-4 bg-white border-b border-line">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-ink-soft uppercase block">Invoice Number</span>
              <span className="font-mono font-bold text-base text-ink">#{invoice.invoiceNumber}</span>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                isPaid 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : invoice.status === 'Void'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {isPaid && <CheckCircle2 size={12} />}
                {invoice.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-dashed border-line/80 text-ink-soft">
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-teal-dark flex-shrink-0" />
              <span>{new Date(invoice.issuedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}</span>
            </div>
            {invoice.customerName && (
              <div className="flex items-center gap-1.5 justify-end">
                <User size={13} className="text-teal-dark flex-shrink-0" />
                <span className="font-semibold text-ink truncate">{invoice.customerName}</span>
              </div>
            )}
          </div>
          {invoice.customerPhone && (
            <p className="text-[11px] text-right font-mono text-ink-soft mt-0.5">
              Mobile: {invoice.customerPhone}
            </p>
          )}
        </div>

        {/* Items List */}
        <div className="p-6">
          <div className="flex items-center justify-between pb-2 mb-3 border-b-2 border-line">
            <span className="text-xs font-bold uppercase tracking-wider text-ink">Item & Description</span>
            <span className="text-xs font-bold uppercase tracking-wider text-ink text-right">Amount</span>
          </div>

          <div className="divide-y divide-line/60">
            {invoice.lines.map((line: any, idx: number) => (
              <div key={idx} className="py-2.5 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink leading-snug">
                    {line.productName}
                  </p>
                  {line.variantAttribute && (
                    <p className="text-xs text-ink-soft font-mono mt-0.5">{line.variantAttribute}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-ink-soft mt-1">
                    <span className="font-mono bg-paper-alt px-1.5 py-0.5 rounded font-semibold text-ink">
                      {line.quantity} × {fmt(line.unitPrice)}
                    </span>
                    {line.taxRate > 0 && (
                      <span className="text-[10px]">GST {(line.taxRate * 100).toFixed(0)}%</span>
                    )}
                    {line.lineDiscount > 0 && (
                      <span className="text-[10px] text-cherry font-medium">-{fmt(line.lineDiscount)} off</span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono font-bold text-sm text-ink flex-shrink-0 pt-0.5">
                  {fmt(line.lineTotal)}
                </div>
              </div>
            ))}
          </div>

          {/* Financial Breakdown Table */}
          <div className="mt-4 pt-3 border-t-2 border-dashed border-line space-y-1.5 text-xs text-ink-soft">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono text-ink font-semibold">{fmt(invoice.subtotal)}</span>
            </div>

            {invoice.discountTotal > 0 && (
              <div className="flex justify-between text-cherry font-medium">
                <span>Discounts & Offers</span>
                <span className="font-mono">-{fmt(invoice.discountTotal)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>GST / Taxes</span>
              <span className="font-mono text-ink">{fmt(invoice.taxTotal)}</span>
            </div>

            {/* Grand Total Highlight */}
            <div className="mt-3 pt-3 border-t-2 border-line flex justify-between items-baseline">
              <span className="text-base font-black text-ink uppercase tracking-tight">Grand Total</span>
              <span className="font-mono text-2xl font-black text-teal-dark">{fmt(invoice.grandTotal)}</span>
            </div>
          </div>

          {/* Payments breakdown */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-line">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink uppercase tracking-wider mb-2">
                <CreditCard size={13} className="text-teal-dark" />
                <span>Payment Settlement</span>
              </div>
              <div className="space-y-1.5">
                {invoice.payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center bg-paper-alt/50 px-3 py-2 rounded-lg text-xs">
                    <div>
                      <span className="font-bold text-ink">{p.method}</span>
                      {p.referenceNumber && (
                        <span className="text-ink-soft font-mono ml-1.5 text-[11px]">Ref: {p.referenceNumber}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-emerald-700">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Returns / Refunds Section if any */}
          {hasReturns && (
            <div className="mt-4 p-3 bg-red-50/70 border border-red-200 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-red-800 mb-1">
                <div className="flex items-center gap-1">
                  <RotateCcw size={13} />
                  <span>Refund / Return Processed</span>
                </div>
                <span className="font-mono">-{fmt(totalRefunded)}</span>
              </div>
              <p className="text-[11px] text-red-700">
                {invoice.returns.length} return transaction(s) recorded against this invoice.
              </p>
            </div>
          )}

          {/* Environmental Paperless Badge */}
          <div className="mt-6 p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <Leaf size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-900">Green & Paperless Receipt</p>
              <p className="text-[11px] text-emerald-700">
                By receiving this digital invoice, you helped save paper and protect trees. 🌱
              </p>
            </div>
          </div>

          {/* Store Footer Message */}
          <div className="mt-6 pt-4 border-t border-dashed border-line text-center">
            <p className="text-xs font-medium text-ink mb-1">
              {invoice.receiptFooter}
            </p>
            <p className="text-[10px] font-mono text-ink-soft uppercase tracking-widest mt-2">
              Powered by Vikreta Retail OS
            </p>
          </div>

        </div>

      </div>

      {/* Bottom Sticky Action on Mobile */}
      <div className="w-full max-w-lg mt-4 flex items-center justify-center gap-3 no-print">
        <button
          onClick={handleShareWhatsApp}
          className="flex-1 bg-[#25D366] hover:bg-[#1EBE5D] text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
        >
          <MessageCircle size={16} />
          <span>WhatsApp Bill</span>
        </button>
        <button
          onClick={handleCopyLink}
          className="bg-white hover:bg-paper-alt text-ink border border-line py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          <span>{copied ? 'Link Copied' : 'Copy Link'}</span>
        </button>
      </div>

    </div>
  );
};
