import React, { useState, useMemo } from 'react';
import { X, RotateCcw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoicesApi } from '../api/client';

interface ReturnLineItem {
  invoiceLineId: string;
  productId: string;
  productName: string;
  quantityPurchased: number;
  quantityAlreadyReturned: number;
  quantityToReturn: number;
  unitPrice: number;
  lineTotal: number;
  refundAmount: number;
  restockInventory: boolean;
}

interface ProcessReturnModalProps {
  invoice: any;
  onClose: () => void;
  onSuccess: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const ProcessReturnModal: React.FC<ProcessReturnModalProps> = ({
  invoice,
  onClose,
  onSuccess,
}) => {
  // Calculate existing returns per line
  const alreadyReturnedMap = useMemo(() => {
    const map = new Map<string, number>();
    if (invoice.returns && Array.isArray(invoice.returns)) {
      invoice.returns.forEach((ret: any) => {
        if (ret.lines && Array.isArray(ret.lines)) {
          ret.lines.forEach((l: any) => {
            map.set(l.invoiceLineId, (map.get(l.invoiceLineId) || 0) + l.quantityReturned);
          });
        }
      });
    }
    return map;
  }, [invoice]);

  const [items, setItems] = useState<ReturnLineItem[]>(() => {
    return (invoice.lines || []).map((l: any) => {
      const already = alreadyReturnedMap.get(l.id) || 0;
      return {
        invoiceLineId: l.id,
        productId: l.productId,
        productName: l.productNameSnapshot,
        quantityPurchased: l.quantity,
        quantityAlreadyReturned: already,
        quantityToReturn: 0,
        unitPrice: l.unitPriceSnapshot,
        lineTotal: l.lineTotal,
        refundAmount: 0,
        restockInventory: true,
      };
    });
  });

  const [refundType, setRefundType] = useState<'Cash' | 'StoreCredit' | 'Card' | 'UPI'>('Cash');
  const [reason, setReason] = useState('Customer return');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleQtyChange = (idx: number, val: number) => {
    setItems((prev) => {
      const copy = [...prev];
      const it = { ...copy[idx] };
      const maxAllowed = it.quantityPurchased - it.quantityAlreadyReturned;
      const cleanVal = Math.max(0, Math.min(maxAllowed, val));
      it.quantityToReturn = cleanVal;
      // Calculate pro-rated refund amount based on line total
      const unitVal = it.lineTotal / it.quantityPurchased;
      it.refundAmount = Math.round(unitVal * cleanVal * 100) / 100;
      copy[idx] = it;
      return copy;
    });
  };

  const handleRestockToggle = (idx: number) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], restockInventory: !copy[idx].restockInventory };
      return copy;
    });
  };

  const totalRefund = items.reduce((sum, it) => sum + it.refundAmount, 0);
  const totalItemsToReturn = items.reduce((sum, it) => sum + it.quantityToReturn, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalItemsToReturn <= 0) {
      toast.error('Please select at least 1 item quantity to return.');
      return;
    }

    if (refundType === 'StoreCredit' && !invoice.customerId) {
      toast.error('Store Credit refunds require a registered customer on the invoice.');
      return;
    }

    const payloadItems = items
      .filter((it) => it.quantityToReturn > 0)
      .map((it) => ({
        invoiceLineId: it.invoiceLineId,
        quantity: it.quantityToReturn,
        refundAmount: it.refundAmount,
        restockInventory: it.restockInventory,
        reason,
      }));

    setIsSubmitting(true);
    try {
      await invoicesApi.createReturn(invoice.id, {
        refundType,
        reason,
        items: payloadItems,
      });
      toast.success('Return & refund processed successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to process return';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cherry-soft text-cherry flex items-center justify-center font-bold">
              <RotateCcw size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold">Process Return / Exchange / Refund</h2>
              <p className="text-xs text-ink-soft">
                Invoice #{invoice.invoiceNumber} • {invoice.locationName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Customer info note if any */}
          {invoice.customerName ? (
            <div className="p-3 rounded bg-teal-soft/40 border border-teal/30 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-teal-900">Customer: {invoice.customerName}</span>
                {invoice.customer?.storeCreditBalance != null && (
                  <span className="ml-2 text-ink-soft font-mono">
                    (Current Store Credit: {fmt(invoice.customer.storeCreditBalance)})
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-teal">Store Credit Eligible</span>
            </div>
          ) : (
            <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>Walk-in customer: Store Credit option is disabled. Refund can be processed as Cash/Card/UPI.</span>
            </div>
          )}

          {/* Line Items Table */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b border-line bg-paper-alt">
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">
                Select Items to Return & Restock
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product Item</th>
                    <th className="text-right">Sold Qty</th>
                    <th className="text-right">Prev Returned</th>
                    <th className="text-center w-28">Return Qty</th>
                    <th className="text-center">Restock Stock?</th>
                    <th className="text-right">Refund Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const maxAllowed = it.quantityPurchased - it.quantityAlreadyReturned;
                    const isFullyReturned = maxAllowed <= 0;
                    return (
                      <tr key={it.invoiceLineId} className={isFullyReturned ? 'opacity-50 bg-paper-alt' : ''}>
                        <td>
                          <p className="font-semibold text-xs text-ink">{it.productName}</p>
                          <p className="text-[10px] text-ink-soft font-mono">Unit: {fmt(it.unitPrice)}</p>
                        </td>
                        <td className="text-right font-mono text-xs">{it.quantityPurchased}</td>
                        <td className="text-right font-mono text-xs text-amber-700">
                          {it.quantityAlreadyReturned}
                        </td>
                        <td className="text-center">
                          {isFullyReturned ? (
                            <span className="text-[11px] font-bold text-ink-soft">Fully Returned</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(idx, it.quantityToReturn - 1)}
                                className="w-6 h-6 rounded border border-line bg-paper flex items-center justify-center text-xs font-bold hover:bg-paper-alt"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={maxAllowed}
                                value={it.quantityToReturn}
                                onChange={(e) => handleQtyChange(idx, parseInt(e.target.value) || 0)}
                                className="w-12 h-6 text-center font-mono text-xs input p-0"
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyChange(idx, it.quantityToReturn + 1)}
                                className="w-6 h-6 rounded border border-line bg-paper flex items-center justify-center text-xs font-bold hover:bg-paper-alt"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="text-center">
                          {!isFullyReturned && (
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={it.restockInventory}
                                onChange={() => handleRestockToggle(idx)}
                                className="checkbox"
                              />
                              <span className="text-xs text-ink-soft">Auto-restock</span>
                            </label>
                          )}
                        </td>
                        <td className="text-right font-mono text-xs font-semibold text-emerald-700">
                          {fmt(it.refundAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Options & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                Refund Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Cash', 'StoreCredit', 'Card', 'UPI'] as const).map((m) => {
                  const isStoreCreditDisabled = m === 'StoreCredit' && !invoice.customerId;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={isStoreCreditDisabled}
                      onClick={() => setRefundType(m)}
                      className={`p-2.5 rounded text-xs font-bold border transition-all text-center ${
                        refundType === m
                          ? 'border-cherry bg-cherry text-white shadow-sm'
                          : isStoreCreditDisabled
                          ? 'border-line/40 bg-paper-alt text-ink-soft/40 cursor-not-allowed'
                          : 'border-line bg-paper hover:bg-paper-alt text-ink'
                      }`}
                    >
                      {m === 'StoreCredit' ? 'Store Credit' : m}
                      {m === 'StoreCredit' && isStoreCreditDisabled && ' (No Cust)'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                Reason for Return
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input text-xs w-full mb-2"
              >
                <option value="Customer return">Customer return</option>
                <option value="Defective / Damaged product">Defective / Damaged product</option>
                <option value="Wrong shade / size / variant">Wrong shade / size / variant</option>
                <option value="Customer changed mind">Customer changed mind</option>
                <option value="Product expired / quality issue">Product expired / quality issue</option>
                <option value="Other">Other</option>
              </select>
              {reason === 'Other' && (
                <input
                  type="text"
                  placeholder="Enter reason..."
                  onChange={(e) => setReason(e.target.value)}
                  className="input text-xs w-full"
                />
              )}
            </div>
          </div>

          {/* Summary Box */}
          <div className="p-4 rounded-lg border-2 border-line bg-paper-alt flex items-center justify-between">
            <div>
              <p className="text-xs text-ink-soft font-bold uppercase tracking-wider">Total Refund Due</p>
              <p className="text-2xl font-bold font-mono text-emerald-700">{fmt(totalRefund)}</p>
              <p className="text-[11px] text-ink-soft">
                {totalItemsToReturn} item(s) returning via{' '}
                <strong className="text-ink">{refundType === 'StoreCredit' ? 'Store Credit' : refundType}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-outline text-xs px-4">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || totalItemsToReturn <= 0}
                className="btn-primary text-xs px-5 bg-cherry hover:bg-cherry-dark border-cherry-dark flex items-center gap-1.5"
              >
                <RotateCcw size={13} className={isSubmitting ? 'animate-spin' : ''} />
                {isSubmitting ? 'Processing...' : 'Confirm Return & Refund'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
