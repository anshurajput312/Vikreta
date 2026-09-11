import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { invoicesApi } from '../../api/client';
import { DataTable, type Column } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { DateRangePicker } from '../../components/FormControls';
import { useLocationStore } from '../../stores/locationStore';
import { ShareInvoiceModal } from '../../components/ShareInvoiceModal';

const fmt = (n: number) => `₹${n.toFixed(2)}`;

const today = new Date().toISOString().split('T')[0];
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeLocation } = useLocationStore();
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sharingInvoice, setSharingInvoice] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', activeLocation?.id, from, to, status, page],
    queryFn: () => invoicesApi.list({ locationId: activeLocation?.id, from, to, status: status || undefined, page, pageSize: 25 }),
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.totalCount ?? 0;

  const STATUSES = ['', 'Paid', 'PartiallyPaid', 'Void', 'Draft'];

  const columns: Column<any>[] = [
    { key: 'invoiceNumber', header: 'Invoice #', render: i => <span className="font-mono text-sm">#{i.invoiceNumber}</span> },
    { key: 'customerName', header: 'Customer', render: i => <span className="text-sm font-medium">{i.customerName ?? 'Walk-in'}</span> },
    { key: 'issuedAt', header: 'Date', render: i => <span className="text-sm text-ink-soft">{new Date(i.issuedAt).toLocaleDateString()}</span> },
    { key: 'status', header: 'Status', render: i => <StatusBadge status={i.status} /> },
    { key: 'grandTotal', header: 'Total', render: i => <span className="font-mono text-sm font-semibold">{fmt(i.grandTotal)}</span>, className: 'text-right' },
    {
      key: 'share',
      header: 'Digital Bill',
      render: i => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSharingInvoice(i);
          }}
          className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg inline-flex items-center gap-1 transition-colors"
          title="Share via WhatsApp or SMS"
        >
          <MessageCircle size={13} className="text-emerald-600" />
          <span>Share</span>
        </button>
      ),
      className: 'text-center w-28',
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">Invoices</h1>
      </div>

      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <div className="flex gap-1">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all
                ${status === s ? 'bg-ink text-white border-ink' : 'bg-white border-line hover:border-teal text-ink-soft'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={items}
          keyField="id"
          loading={isLoading}
          onRowClick={i => navigate(`/invoices/${i.id}`)}
          totalCount={total}
          page={page}
          pageSize={25}
          onPageChange={setPage}
          emptyMessage="No invoices found."
        />
      </div>

      {sharingInvoice && (
        <ShareInvoiceModal
          isOpen={Boolean(sharingInvoice)}
          onClose={() => setSharingInvoice(null)}
          invoiceId={sharingInvoice.id}
          invoiceNumber={sharingInvoice.invoiceNumber}
          customerName={sharingInvoice.customerName}
          customerPhone={sharingInvoice.customerPhone}
          grandTotal={sharingInvoice.grandTotal}
        />
      )}
    </div>
  );
};
