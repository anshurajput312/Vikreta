import React, { useState, useEffect } from 'react';
import { 
  X, 
  MessageCircle, 
  PhoneCall, 
  Copy, 
  Check, 
  QrCode, 
  Eye, 
  Sparkles,
  Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  formatWhatsAppReceipt, 
  buildWhatsAppLink, 
  formatSmsReceipt, 
  buildSmsLink, 
  getDigitalInvoiceUrl,
  type WhatsAppReceiptParams 
} from '../utils/whatsappReceipt';

interface ShareInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  grandTotal: number;
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  items?: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  paymentMethod?: string;
  storeName?: string;
  storeAddress?: string;
}

export const ShareInvoiceModal: React.FC<ShareInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  invoiceNumber,
  customerName,
  customerPhone,
  grandTotal,
  subtotal,
  discountTotal,
  taxTotal,
  items = [],
  paymentMethod,
  storeName,
  storeAddress,
}) => {
  const [phone, setPhone] = useState(customerPhone || '');
  const [activeTab, setActiveTab] = useState<'quick' | 'preview' | 'qr'>('quick');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhone(customerPhone || '');
    }
  }, [isOpen, customerPhone]);

  if (!isOpen) return null;

  const resolvedStoreName = storeName || localStorage.getItem('store_upi_name') || 'Vikreta Store';
  const invoiceUrl = getDigitalInvoiceUrl(invoiceId);

  const receiptParams: WhatsAppReceiptParams = {
    storeName: resolvedStoreName,
    invoiceNumber,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    customerName: customerName || null,
    items,
    subtotal: subtotal ?? grandTotal,
    discountTotal: discountTotal ?? 0,
    taxTotal: taxTotal ?? 0,
    grandTotal,
    paymentMethod,
    storeAddress,
    invoiceUrl,
  };

  const whatsappMessage = formatWhatsAppReceipt(receiptParams);
  const smsMessage = formatSmsReceipt(receiptParams);

  const handleSendWhatsApp = () => {
    const url = buildWhatsAppLink(phone, whatsappMessage);
    window.open(url, '_blank');
    toast.success('Opening WhatsApp to send digital bill…');
    onClose();
  };

  const handleSendSms = () => {
    const url = buildSmsLink(phone, smsMessage);
    window.location.href = url;
    toast.success('Opening SMS app with bill details…');
    onClose();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(invoiceUrl);
    setCopied(true);
    toast.success('Invoice link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyWhatsAppText = () => {
    navigator.clipboard.writeText(whatsappMessage);
    toast.success('Receipt text copied!');
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invoiceUrl)}&margin=8`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-paper rounded-2xl shadow-2xl border-2 border-line w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 text-[#25D366] flex items-center justify-center font-bold">
              <MessageCircle size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-ink">Share Digital Invoice</h2>
              <p className="text-[11px] font-mono text-ink-soft">Bill #{invoiceNumber} · ₹{grandTotal.toFixed(2)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-paper-alt transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-line bg-paper-alt/50 text-xs font-semibold px-4 pt-2">
          <button
            onClick={() => setActiveTab('quick')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'quick' ? 'border-teal text-teal-dark font-bold' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Smartphone size={13} />
            <span>1-Click Share</span>
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'qr' ? 'border-teal text-teal-dark font-bold' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <QrCode size={13} />
            <span>Counter QR Scan</span>
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'preview' ? 'border-teal text-teal-dark font-bold' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Eye size={13} />
            <span>Message Preview</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          
          {/* Recipient Phone input */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Customer Mobile / WhatsApp Number
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft font-mono">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendWhatsApp()}
                placeholder="10-digit mobile number"
                className="input-field pl-11 pr-4 text-sm font-mono tracking-wider w-full"
                autoFocus
              />
            </div>
            {customerName && (
              <p className="text-[11px] text-ink-soft mt-1 flex items-center gap-1">
                <span>Customer:</span>
                <span className="font-semibold text-ink">{customerName}</span>
              </p>
            )}
          </div>

          {/* Quick 1-Click Tab */}
          {activeTab === 'quick' && (
            <div className="space-y-2.5 pt-1">
              {/* WhatsApp Button */}
              <button
                onClick={handleSendWhatsApp}
                className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                id="modal-send-whatsapp-btn"
              >
                <MessageCircle size={18} />
                <span>Send Bill on WhatsApp</span>
              </button>

              {/* SMS Button */}
              <button
                onClick={handleSendSms}
                className="w-full bg-ink hover:bg-ink-dark text-white py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
                id="modal-send-sms-btn"
              >
                <PhoneCall size={15} />
                <span>Send Bill via SMS Text</span>
              </button>

              {/* Copy Link button */}
              <div className="pt-2 flex items-center gap-2">
                <div className="flex-1 bg-paper-alt border border-line rounded-xl px-3 py-2 text-xs font-mono truncate text-ink-soft">
                  {invoiceUrl}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="bg-white hover:bg-paper-alt text-ink border border-line rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors flex-shrink-0"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>
          )}

          {/* QR Code Tab */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center justify-center py-2 text-center space-y-3">
              <div className="p-3 bg-white border-2 border-line rounded-2xl shadow-md inline-block">
                <img 
                  src={qrImageUrl} 
                  alt="Scan for Digital Bill" 
                  className="w-44 h-44 object-contain rounded-lg"
                  onError={(e) => {
                    // Fallback if offline
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-xs font-semibold text-ink">
                Customer can scan this QR with their mobile camera
              </p>
              <p className="text-[11px] text-ink-soft max-w-xs">
                Opens the verified paperless invoice immediately on their phone with zero app download.
              </p>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px] text-ink-soft">
                <span>WhatsApp Message Content:</span>
                <button 
                  onClick={handleCopyWhatsAppText}
                  className="text-teal-dark hover:underline flex items-center gap-1 font-semibold"
                >
                  <Copy size={11} /> Copy Text
                </button>
              </div>
              <div className="bg-paper-alt/80 border border-line rounded-xl p-3 max-h-48 overflow-y-auto text-xs font-mono whitespace-pre-wrap text-ink leading-relaxed">
                {whatsappMessage}
              </div>
            </div>
          )}

          {/* Environmental note */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] text-emerald-800">
            <Sparkles size={14} className="text-emerald-600 flex-shrink-0" />
            <span>Paperless digital invoicing saves trees, cost, and delights shoppers!</span>
          </div>

        </div>

      </div>
    </div>
  );
};
