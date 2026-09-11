import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronLeft, Printer, MessageCircle, RotateCcw, PackageCheck } from 'lucide-react';
import { invoicesApi } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MoneyInput } from '../../components/FormControls';
import { ProcessReturnModal } from '../../components/ProcessReturnModal';
import { ShareInvoiceModal } from '../../components/ShareInvoiceModal';

const fmt = (n: number) => `₹${n.toFixed(2)}`;

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoicesApi.get(id!),
  });
  const invoice = data?.data;

  const handleOpenShare = () => {
    setShareModalOpen(true);
  };

  const voidMutation = useMutation({
    mutationFn: () => invoicesApi.void(id!),
    onSuccess: () => { toast.success('Invoice voided.'); qc.invalidateQueries({ queryKey: ['invoice', id] }); setVoidOpen(false); },
    onError: () => toast.error('Failed to void invoice.'),
  });

  const payMutation = useMutation({
    mutationFn: () => invoicesApi.addPayment(id!, { amount: paymentAmount, method: paymentMethod, referenceNumber: '' }),
    onSuccess: () => { toast.success('Payment added!'); qc.invalidateQueries({ queryKey: ['invoice', id] }); setPaymentAmount(0); },
    onError: () => toast.error('Failed to add payment.'),
  });

  if (isLoading) return <div className="p-8 text-center text-ink-soft">Loading…</div>;
  if (!invoice) return <div className="p-8 text-center text-cherry">Invoice not found.</div>;

  return (
    <div className="p-6 max-w-3xl printable-area">
      <button onClick={() => navigate('/invoices')} className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink mb-4 no-print">
        <ChevronLeft size={14} /> Back to Invoices
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold font-mono">#{invoice.invoiceNumber}</h1>
          <p className="text-sm text-ink-soft">{new Date(invoice.issuedAt).toLocaleString()} · {invoice.locationName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          <button onClick={handleOpenShare} className="btn-secondary no-print text-emerald-600 hover:text-emerald-700 hover:border-emerald-300 flex items-center gap-1.5" id="whatsapp-invoice-btn" title="Share digital bill via WhatsApp & SMS">
            <MessageCircle size={14} className="text-emerald-600" /> Share Bill
          </button>
          <button onClick={() => window.print()} className="btn-secondary no-print" id="print-invoice-btn">
            <Printer size={14} /> Print
          </button>
          {invoice.status !== 'Void' && invoice.status !== 'Refunded' && (
            <button
              onClick={() => setReturnModalOpen(true)}
              className="btn-outline flex items-center gap-1.5 text-xs text-cherry border-cherry hover:bg-cherry-soft no-print"
              id="return-invoice-btn"
            >
              <RotateCcw size={14} /> Return / Refund
            </button>
          )}
          {invoice.status !== 'Void' && (
            <button onClick={() => setVoidOpen(true)} className="btn-danger no-print" id="void-btn">
              Void Invoice
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lines */}
        <div className="card md:col-span-2">
          <div className="card-head"><h3 className="text-sm font-bold">Line Items</h3></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th><th className="text-right">Qty</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <p className="text-sm font-medium">{l.productNameSnapshot}</p>
                    {l.variantAttributeSnapshot && <p className="text-xs text-ink-soft">{l.variantAttributeSnapshot}</p>}
                  </td>
                  <td className="text-right font-mono text-sm">{l.quantity}</td>
                  <td className="text-right font-mono text-sm">{fmt(l.unitPriceSnapshot)}</td>
                  <td className="text-right font-mono text-xs text-ink-soft">{(l.taxRateSnapshot * 100).toFixed(0)}%</td>
                  <td className="text-right font-mono text-sm font-semibold">{fmt(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td colSpan={4} className="text-right text-xs text-ink-soft px-4 py-2">Subtotal</td>
                <td className="text-right font-mono px-4 py-2">{fmt(invoice.subtotal)}</td>
              </tr>
              {invoice.discountTotal > 0 && (
                <tr>
                  <td colSpan={4} className="text-right text-xs text-cherry font-medium px-4 py-2">Discount</td>
                  <td className="text-right font-mono px-4 py-2 text-cherry font-medium">-{fmt(invoice.discountTotal)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={4} className="text-right text-xs text-ink-soft px-4 py-2">Tax</td>
                <td className="text-right font-mono px-4 py-2">{fmt(invoice.taxTotal)}</td>
              </tr>
              <tr className="font-bold text-base">
                <td colSpan={4} className="text-right px-4 py-3">Total</td>
                <td className="text-right font-mono px-4 py-3 text-teal-dark">{fmt(invoice.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payments */}
        <div className="card">
          <div className="card-head"><h3 className="text-sm font-bold">Payments</h3></div>
          <div>
            {invoice.payments.map((p: any) => (
              <div key={p.id} className="flex justify-between items-center px-4 py-3 border-b border-paper-alt last:border-b-0 text-sm">
                <div>
                  <p className="font-medium">{p.method}</p>
                  <p className="text-xs text-ink-soft">{new Date(p.paidAt).toLocaleString()}</p>
                </div>
                <span className="font-mono font-semibold">{fmt(p.amount)}</span>
              </div>
            ))}
            {invoice.payments.length === 0 && (
              <p className="text-center text-sm text-ink-soft py-6">No payments recorded.</p>
            )}
          </div>
        </div>

        {/* Add payment */}
        {invoice.status !== 'Void' && invoice.status !== 'Paid' && (
          <div className="card">
            <div className="card-head"><h3 className="text-sm font-bold">Add Payment</h3></div>
            <div className="px-4 py-4 space-y-3">
              <MoneyInput label="Amount" id="payment-amount" value={paymentAmount} onChange={setPaymentAmount} />
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input" id="payment-method">
                  <option>Cash</option><option>UPI</option><option>Card</option><option>StoreCredit</option><option>Other</option>
                </select>
              </div>
              <button onClick={() => payMutation.mutate()} disabled={paymentAmount <= 0 || payMutation.isPending} className="btn-teal w-full justify-center" id="add-payment-btn">
                {payMutation.isPending ? 'Adding…' : 'Add Payment'}
              </button>
            </div>
          </div>
        )}

        {/* Returns & Refunds History */}
        {invoice.returns && invoice.returns.length > 0 && (
          <div className="card md:col-span-2 border-l-4 border-l-cherry">
            <div className="card-head flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-1.5 text-cherry">
                <RotateCcw size={14} /> Returns & Refunds History ({invoice.returns.length})
              </h3>
              <span className="text-xs font-mono font-bold text-cherry">
                Total Refunded: {fmt(invoice.returns.reduce((s: number, r: any) => s + r.totalRefundAmount, 0))}
              </span>
            </div>
            <div className="divide-y divide-paper-alt">
              {invoice.returns.map((ret: any) => (
                <div key={ret.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-ink">{ret.returnNumber}</span>
                      <span className="text-xs text-ink-soft ml-2">
                        {new Date(ret.returnedAt).toLocaleString()}
                      </span>
                      {ret.processedByUserName && (
                        <span className="text-xs text-ink-soft ml-2">
                          • Handled by: <strong className="text-ink">{ret.processedByUserName}</strong>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cherry-soft text-cherry border border-cherry/20">
                        Refund: {ret.refundType}
                      </span>
                      <span className="font-mono font-bold text-sm text-cherry">
                        {fmt(ret.totalRefundAmount)}
                      </span>
                    </div>
                  </div>

                  {ret.reason && (
                    <p className="text-xs text-ink-soft italic">Reason: "{ret.reason}"</p>
                  )}

                  {/* Return Lines */}
                  <div className="bg-paper-alt rounded p-2.5 mt-2 space-y-1">
                    {ret.lines?.map((rl: any) => (
                      <div key={rl.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink flex items-center gap-1.5">
                          <PackageCheck size={13} className={rl.restockInventory ? 'text-teal' : 'text-ink-soft'} />
                          {rl.productName} × {rl.quantityReturned}
                          {rl.restockInventory && (
                            <span className="text-[10px] text-teal font-semibold">(Restocked)</span>
                          )}
                        </span>
                        <span className="font-mono font-semibold text-ink-soft">
                          {fmt(rl.refundAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={voidOpen} title="Void Invoice" message={`Void invoice #${invoice.invoiceNumber}? Stock will be reversed.`} confirmLabel="Void" variant="danger" onConfirm={() => voidMutation.mutate()} onCancel={() => setVoidOpen(false)} />

      {returnModalOpen && (
        <ProcessReturnModal
          invoice={invoice}
          onClose={() => setReturnModalOpen(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['invoice', id] })}
        />
      )}

      {shareModalOpen && (
        <ShareInvoiceModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          customerName={invoice.customerName}
          customerPhone={invoice.customerPhone}
          grandTotal={invoice.grandTotal}
          subtotal={invoice.subtotal}
          discountTotal={invoice.discountTotal}
          taxTotal={invoice.taxTotal}
          items={invoice.lines.map((l: any) => ({
            name: l.productNameSnapshot + (l.variantAttributeSnapshot ? ` (${l.variantAttributeSnapshot})` : ''),
            quantity: l.quantity,
            unitPrice: l.unitPriceSnapshot,
            lineTotal: l.lineTotal,
          }))}
          paymentMethod={invoice.payments?.map((p: any) => p.method).join(', ')}
        />
      )}
    </div>
  );
};
