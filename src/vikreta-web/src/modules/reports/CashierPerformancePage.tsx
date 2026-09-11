import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  UserCheck,
  Trophy,
  Receipt,
  DollarSign,
  RefreshCw,
  Calendar,
  Percent,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi, locationsApi } from '../../api/client';
import { exportToExcel, exportToCsv } from '../../utils/xlsxExport';

const today = new Date().toISOString().split('T')[0];
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const CashierPerformancePage: React.FC = () => {
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState('');

  const { data: locData } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list() });
  const locations: any[] = Array.isArray(locData) ? locData : (locData?.data ?? []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-cashier-performance', from, to, locationId],
    queryFn: () =>
      reportsApi.cashierPerformance({
        from,
        to,
        locationId: locationId || undefined,
      }),
  });

  const report = data?.data ?? {
    totalSalesAllStaff: 0,
    totalInvoicesAllStaff: 0,
    storeAvgBillSize: 0,
    cashiers: [],
  };

  const cashiers: any[] = report.cashiers || [];
  const topCashier = cashiers.length > 0 ? cashiers[0] : null;

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days === 0) {
      setFrom(end.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else if (days === 1) {
      const yest = new Date(Date.now() - 86400000);
      setFrom(yest.toISOString().split('T')[0]);
      setTo(yest.toISOString().split('T')[0]);
    } else if (days === -1) {
      const firstDay = new Date(end.getFullYear(), end.getMonth(), 1);
      setFrom(firstDay.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else {
      start.setDate(start.getDate() - days);
      setFrom(start.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    }
  };

  const handleExportExcel = () => {
    const headers = [
      'Staff Member',
      'Role',
      'Email',
      'Invoices Handled',
      'Total Sales (INR)',
      'Avg Bill Size (INR)',
      'Discounts Given (INR)',
      'Tax Collected (INR)',
      'Revenue Share (%)',
    ];
    const rows = cashiers.map((c: any) => {
      const share =
        report.totalSalesAllStaff > 0
          ? ((c.totalSales / report.totalSalesAllStaff) * 100).toFixed(1)
          : '0';
      return [
        c.staffName,
        c.role,
        c.email,
        c.totalInvoices,
        Number(c.totalSales.toFixed(2)),
        Number(c.averageBillSize.toFixed(2)),
        Number(c.totalDiscountGiven.toFixed(2)),
        Number(c.totalTaxCollected.toFixed(2)),
        Number(share),
      ];
    });
    exportToExcel(`cashier_performance_${from}_to_${to}`, 'Staff_Performance', headers, rows);
    toast.success('Staff performance report exported to Excel (.xlsx)!');
  };

  const handleExportCsv = () => {
    const headers = [
      'Staff Member',
      'Role',
      'Email',
      'Invoices Handled',
      'Total Sales (INR)',
      'Avg Bill Size (INR)',
      'Discounts Given (INR)',
      'Tax Collected (INR)',
      'Revenue Share (%)',
    ];
    const rows = cashiers.map((c: any) => {
      const share =
        report.totalSalesAllStaff > 0
          ? ((c.totalSales / report.totalSalesAllStaff) * 100).toFixed(1)
          : '0';
      return [
        c.staffName,
        c.role,
        c.email,
        c.totalInvoices,
        c.totalSales.toFixed(2),
        c.averageBillSize.toFixed(2),
        c.totalDiscountGiven.toFixed(2),
        c.totalTaxCollected.toFixed(2),
        `${share}%`,
      ];
    });
    exportToCsv(`cashier_performance_${from}_to_${to}`, headers, rows);
    toast.success('Staff performance report exported to CSV!');
  };

  const chartData = cashiers.map((c: any) => ({
    name: c.staffName,
    Sales: c.totalSales,
    Invoices: c.totalInvoices,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Staff & Cashier Sales Performance</h1>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-purple-100 text-purple-900 border border-purple-300 rounded-full flex items-center gap-1">
              <UserCheck size={12} className="text-purple-700" /> Cashier Metrics
            </span>
          </div>
          <p className="text-sm text-ink-soft mt-0.5">
            Track total sales, invoice counts, and average bill size handled by each cashier or team member.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline flex items-center gap-1.5 text-xs"
            title="Refresh"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            className="btn-outline flex items-center gap-1.5 text-xs"
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="btn-primary flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white"
          >
            <FileSpreadsheet size={13} />
            Export to Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 border-l-4 border-l-teal">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Total Sales Handled</span>
            <DollarSign size={16} className="text-teal" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1">{fmt(report.totalSalesAllStaff)}</p>
          <p className="text-xs text-ink-soft mt-1">Across all team members</p>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Total Invoices</span>
            <Receipt size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1">{report.totalInvoicesAllStaff}</p>
          <p className="text-xs text-ink-soft mt-1">Total customer checkouts processed</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Store Avg Bill Size</span>
            <Percent size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-emerald-700">{fmt(report.storeAvgBillSize)}</p>
          <p className="text-xs text-ink-soft mt-1">Average ticket value per customer</p>
        </div>

        <div className="card p-4 border-l-4 border-l-purple-600 bg-purple-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
              <Trophy size={13} className="text-amber-500" /> Top Cashier
            </span>
            <UserCheck size={16} className="text-purple-700" />
          </div>
          <p className="text-xl font-bold font-mono mt-1 text-purple-900 truncate">
            {topCashier ? topCashier.staffName : 'N/A'}
          </p>
          <p className="text-xs text-ink-soft mt-1">
            {topCashier ? `${fmt(topCashier.totalSales)} (${topCashier.totalInvoices} bills)` : 'No sales yet'}
          </p>
        </div>
      </div>

      {/* Filter Controls & Presets */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-line">
          <span className="text-xs font-bold text-ink-soft uppercase tracking-wider mr-1 flex items-center gap-1">
            <Calendar size={12} /> Presets:
          </span>
          {[
            { label: 'Today', days: 0 },
            { label: 'Yesterday', days: 1 },
            { label: 'Last 7 Days', days: 7 },
            { label: 'Last 30 Days', days: 30 },
            { label: 'This Month', days: -1 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => setPreset(p.days)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-line bg-paper hover:bg-paper-alt transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input text-xs w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input text-xs w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="input text-xs w-full"
            >
              <option value="">All Locations</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cashier Comparison Chart */}
      <div className="card p-5">
        <h2 className="text-base font-bold mb-1">Cashier Sales Revenue Comparison</h2>
        <p className="text-xs text-ink-soft mb-4">Total revenue billed per staff member in the selected date range.</p>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">Loading staff sales data...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">No cashier sales recorded.</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any) => [fmt(val), 'Total Sales']} />
                <Bar dataKey="Sales" fill="#0D9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Cashier Detailed Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-line bg-paper-alt flex items-center justify-between">
          <h2 className="text-sm font-bold">Individual Staff & Cashier Breakdown</h2>
          <span className="text-xs text-ink-soft">{cashiers.length} Team Members Active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Team Member</th>
                <th>Role</th>
                <th className="text-right">Invoices Processed</th>
                <th className="text-right">Total Sales</th>
                <th className="text-right">Average Bill Size</th>
                <th className="text-right">Discounts Given</th>
                <th className="text-right">Tax Collected</th>
                <th className="text-right">Revenue Share</th>
              </tr>
            </thead>
            <tbody>
              {cashiers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-ink-soft">
                    No staff records found.
                  </td>
                </tr>
              ) : (
                cashiers.map((c: any, idx: number) => {
                  const share =
                    report.totalSalesAllStaff > 0
                      ? ((c.totalSales / report.totalSalesAllStaff) * 100).toFixed(1)
                      : '0';
                  return (
                    <tr key={idx} className="hover:bg-paper-alt">
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-teal-soft text-teal font-bold font-mono text-xs flex items-center justify-center">
                            {c.staffName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-ink">{c.staffName}</p>
                            <p className="text-[11px] text-ink-soft font-mono">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-paper border border-line">
                          {c.role}
                        </span>
                      </td>
                      <td className="text-right font-mono text-xs font-bold">{c.totalInvoices}</td>
                      <td className="text-right font-mono text-xs font-semibold text-ink">{fmt(c.totalSales)}</td>
                      <td className="text-right font-mono text-xs text-emerald-700 font-medium">
                        {fmt(c.averageBillSize)}
                      </td>
                      <td className="text-right font-mono text-xs text-ink-soft">{fmt(c.totalDiscountGiven)}</td>
                      <td className="text-right font-mono text-xs text-ink-soft">{fmt(c.totalTaxCollected)}</td>
                      <td className="text-right font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded font-bold bg-teal-soft text-teal">
                          {share}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
