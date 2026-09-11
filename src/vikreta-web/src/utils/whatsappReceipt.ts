/**
 * Digital Receipt formatting and sharing utilities for WhatsApp & SMS
 */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export interface WhatsAppReceiptParams {
  storeName: string;
  invoiceNumber: string;
  date: string;
  customerName?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal?: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod?: string;
  storeAddress?: string;
  invoiceUrl?: string;
}

/**
 * Gets the clean, public digital invoice URL for customers
 */
export function getDigitalInvoiceUrl(invoiceId: string): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/receipt/${invoiceId}`;
  }
  return `/receipt/${invoiceId}`;
}

/**
 * Formats a rich, emoji-adorned digital receipt for WhatsApp
 */
export function formatWhatsAppReceipt(p: WhatsAppReceiptParams): string {
  const lines: string[] = [
    `🧾 *${p.storeName.toUpperCase()}*`,
  ];

  if (p.storeAddress) {
    lines.push(`📍 ${p.storeAddress}`);
  }

  lines.push('────────────────────────');
  lines.push(`*Invoice #:* ${p.invoiceNumber}`);
  lines.push(`*Date:* ${p.date}`);
  if (p.customerName) {
    lines.push(`*Customer:* ${p.customerName}`);
  }
  lines.push('────────────────────────');
  lines.push('*ITEMS:*');

  p.items.forEach((item, idx) => {
    lines.push(`${idx + 1}. *${item.name}*`);
    lines.push(`   ${item.quantity} × ${fmt(item.unitPrice)} = *${fmt(item.lineTotal)}*`);
  });

  lines.push('────────────────────────');
  lines.push(`Subtotal: ${fmt(p.subtotal)}`);

  if (p.discountTotal && p.discountTotal > 0) {
    lines.push(`Discount: -${fmt(p.discountTotal)}`);
  }

  lines.push(`Taxes (GST): ${fmt(p.taxTotal)}`);
  lines.push(`*TOTAL AMOUNT: ${fmt(p.grandTotal)}*`);

  if (p.paymentMethod) {
    lines.push(`*Paid via:* ${p.paymentMethod} ✅`);
  }

  if (p.invoiceUrl) {
    lines.push('────────────────────────');
    lines.push('📄 *View / Download Digital Bill:*');
    lines.push(p.invoiceUrl);
  }

  lines.push('────────────────────────');
  lines.push('Thank you for shopping with us! 🙏');
  lines.push('Please visit again.');

  return lines.join('\n');
}

/**
 * Formats a clean, high-impact SMS message with the digital invoice link
 */
export function formatSmsReceipt(p: WhatsAppReceiptParams): string {
  const greeting = p.customerName ? `Dear ${p.customerName}` : 'Dear Customer';
  const parts = [
    `${greeting}, thanks for shopping at ${p.storeName}!`,
    `Bill #${p.invoiceNumber}`,
    `Total: ${fmt(p.grandTotal)}`,
  ];

  if (p.invoiceUrl) {
    parts.push(`View digital bill: ${p.invoiceUrl}`);
  } else {
    parts.push('Thank you, visit again!');
  }

  return parts.join(' | ');
}

/**
 * Creates a clean wa.me link for WhatsApp sharing
 */
export function buildWhatsAppLink(phone: string | null | undefined, text: string): string {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  // Format for Indian numbers if 10 digits
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Creates a standard universal SMS link
 */
export function buildSmsLink(phone: string | null | undefined, text: string): string {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '+91' + cleanPhone;
  } else if (cleanPhone && !cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone;
  }

  const encodedText = encodeURIComponent(text);
  // iOS uses '&body=', Android and desktop use '?body='
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const delimiter = isIOS ? '&' : '?';

  if (cleanPhone) {
    return `sms:${cleanPhone}${delimiter}body=${encodedText}`;
  }
  return `sms:${delimiter}body=${encodedText}`;
}
