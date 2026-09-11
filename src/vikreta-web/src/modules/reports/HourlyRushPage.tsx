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
  Clock,
  Flame,
  Users,
  RefreshCw,
  Calendar,
  Sparkles,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi, locationsApi } from '../../api/client';
import { exportToExcel, exportToCsv } from '../../utils/xlsxExport';

const today = new Date().toISOString().split('T')[0];
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS_LABELS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM',
  '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM',
  '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'
];

export const HourlyRushPage: React.FC = () => {
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState('');
  const [hoveredCell, setHoveredCell] = useState<any | null>(null);

  const { data: locData } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list() });
  const locations: any[] = Array.isArray(locData) ? locData : (locData?.data ?? []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-hourly-rush', from, to, locationId],
    queryFn: () =>
      reportsApi.hourlyRush({
        from,
        to,
        locationId: locationId || undefined,
      }),
  });

  const report = data?.data ?? {
    heatmap: [],
    peakHoursSummary: [],
    busiestDay: 'N/A',
    busiestHour: 'N/A',
  };

  const heatmap: any[] = report.heatmap || [];
  const peakHours: any[] = report.peakHoursSummary || [];

  // Find max invoices in any cell for intensity scaling
  const maxInvoicesInCell = Math.max(1, ...heatmap.map((c: any) => c.invoiceCount || 0));

  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'bg-paper border border-line/50 text-ink-soft/40';
    const ratio = count / maxInvoicesInCell;
    if (ratio < 0.2) return 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold';
    if (ratio < 0.5) return 'bg-teal-200 text-teal-950 border border-teal-400 font-bold';
    if (ratio < 0.8) return 'bg-amber-300 text-amber-950 border border-amber-500 font-bold';
    return 'bg-cherry text-white border border-cherry-dark font-extrabold shadow-sm';
  };

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
    const headers = ['Hour', 'Hour Label', 'Total Invoices', 'Total Revenue (INR)', 'Average Ticket (INR)', 'Staffing Advice'];
    const rows = peakHours.map((h: any) => [
      h.hour,
      h.hourLabel,
      h.totalInvoices,
      Number(h.totalRevenue.toFixed(2)),
      Number(h.avgRevenue.toFixed(2)),
      h.totalInvoices >= 10 ? 'High Rush (2+ Cashiers)' : h.totalInvoices >= 4 ? 'Moderate (1-2 Cashiers)' : 'Normal (1 Cashier)',
    ]);
    exportToExcel(`hourly_rush_${from}_to_${to}`, 'Hourly_Rush', headers, rows);
    toast.success('Hourly Rush report exported to Excel (.xlsx)!');
  };

  const handleExportCsv = () => {
    const headers = ['Hour', 'Hour Label', 'Total Invoices', 'Total Revenue (INR)', 'Average Ticket (INR)', 'Staffing Advice'];
    const rows = peakHours.map((h: any) => [
      h.hour,
      h.hourLabel,
      h.totalInvoices,
      h.totalRevenue.toFixed(2),
      h.avgRevenue.toFixed(2),
      h.totalInvoices >= 10 ? 'High Rush (2+ Cashiers)' : h.totalInvoices >= 4 ? 'Moderate (1-2 Cashiers)' : 'Normal (1 Cashier)',
    ]);
    exportToCsv(`hourly_rush_${from}_to_${to}`, headers, rows);
    toast.success('Hourly Rush report exported to CSV!');
  };

  // 24hr bar chart data (filter store hours 8 AM - 11 PM for high readability, or all 24)
  const chartData = peakHours.map((h: any) => ({
    hourLabel: h.hourLabel,
    Invoices: h.totalInvoices,
    Revenue: h.totalRevenue,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Hourly Sales Rush Heatmap</h1>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded-full flex items-center gap-1">
              <Flame size={12} className="text-amber-600" /> Peak Hours
            </span>
          </div>
          <p className="text-sm text-ink-soft mt-0.5">
            Discover peak store traffic rush hours (e.g. 6 PM – 9 PM) to optimize counter staffing, speed up billing, and prep stock.
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

      {/* Recommendations & Peak Highlights Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 border-l-4 border-l-cherry bg-paper">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Peak Rush Hour</span>
            <Flame size={16} className="text-cherry" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-cherry">{report.busiestHour}</p>
          <p className="text-xs text-ink-soft mt-1">Heaviest checkout traffic time across the store</p>
        </div>

        <div className="card p-4 border-l-4 border-l-teal bg-paper">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Busiest Day</span>
            <Clock size={16} className="text-teal" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-teal">{report.busiestDay}</p>
          <p className="text-xs text-ink-soft mt-1">Day with the highest customer transaction volume</p>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={13} className="text-amber-600" /> Counter Staffing Advice
            </span>
            <Users size={16} className="text-amber-700" />
          </div>
          <p className="text-xs text-ink mt-1 font-medium leading-relaxed">
            {report.busiestHour !== 'N/A'
              ? `Recommend assigning 2+ staff on POS counters during ${report.busiestHour} rush and evening hours to reduce checkout wait time.`
              : 'Add sales transactions to reveal automated staffing recommendations.'}
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

      {/* Interactive 7x24 Heatmap Matrix */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Clock size={16} className="text-teal" />
              Weekly Traffic Heatmap Grid (Day × Hour)
            </h2>
            <p className="text-xs text-ink-soft">
              Numbers indicate customer invoices processed during each 1-hour window. Darker cells represent high-rush periods.
            </p>
          </div>

          {/* Color Legend */}
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-soft">
            <span>Slow</span>
            <span className="w-4 h-4 rounded bg-paper border border-line inline-block" />
            <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300 inline-block" />
            <span className="w-4 h-4 rounded bg-teal-200 border border-teal-400 inline-block" />
            <span className="w-4 h-4 rounded bg-amber-300 border border-amber-500 inline-block" />
            <span className="w-4 h-4 rounded bg-cherry border border-cherry-dark inline-block" />
            <span>Peak Rush</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[780px]">
            {/* Hour Header */}
            <div className="grid grid-cols-[100px_repeat(24,1fr)] gap-1 mb-1 text-center">
              <div className="text-[10px] font-bold text-ink-soft uppercase text-left pl-1">Day</div>
              {HOURS_LABELS.map((hr, idx) => (
                <div key={idx} className="text-[9px] font-mono text-ink-soft truncate" title={hr}>
                  {hr.replace(' ', '')}
                </div>
              ))}
            </div>

            {/* Day Rows */}
            {DAYS.map((dayName, dIdx) => (
              <div key={dIdx} className="grid grid-cols-[100px_repeat(24,1fr)] gap-1 mb-1 items-center">
                <div className="text-xs font-semibold text-ink truncate pl-1">{dayName}</div>
                {Array.from({ length: 24 }).map((_, hIdx) => {
                  const cell = heatmap.find((c: any) => c.dayOfWeek === dIdx && c.hour === hIdx) || {
                    dayOfWeek: dIdx,
                    dayName,
                    hour: hIdx,
                    invoiceCount: 0,
                    revenue: 0,
                    avgTicket: 0,
                  };
                  return (
                    <div
                      key={hIdx}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`h-8 rounded flex items-center justify-center text-[10px] cursor-pointer transition-all hover:scale-110 hover:z-10 relative ${getHeatmapColor(
                        cell.invoiceCount
                      )}`}
                      title={`${dayName} at ${HOURS_LABELS[hIdx]}: ${cell.invoiceCount} invoices (${fmt(cell.revenue)})`}
                    >
                      {cell.invoiceCount > 0 ? cell.invoiceCount : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Hovered Cell Detail Popup / Bar */}
        <div className="mt-3 p-2.5 rounded bg-paper-alt border border-line text-xs flex items-center justify-between">
          {hoveredCell ? (
            <div className="flex items-center gap-4">
              <span className="font-bold text-ink">
                {hoveredCell.dayName} @ {HOURS_LABELS[hoveredCell.hour]}
              </span>
              <span>
                Invoices: <strong className="font-mono">{hoveredCell.invoiceCount}</strong>
              </span>
              <span>
                Total Sales: <strong className="font-mono">{fmt(hoveredCell.revenue)}</strong>
              </span>
              <span>
                Average Ticket: <strong className="font-mono">{fmt(hoveredCell.avgTicket)}</strong>
              </span>
            </div>
          ) : (
            <div className="text-ink-soft flex items-center gap-1.5">
              <Info size={13} />
              Hover over any cell in the heatmap matrix above to view precise rush breakdown.
            </div>
          )}
        </div>
      </div>

      {/* 24-Hour Peak Distribution Chart */}
      <div className="card p-5">
        <h2 className="text-base font-bold mb-1">Hourly Checkout Volume (24-Hour Distribution)</h2>
        <p className="text-xs text-ink-soft mb-4">
          Overall transaction frequency by hour of the day across all selected dates.
        </p>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">Loading hourly trend...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">No traffic data recorded.</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any, name: any) =>
                    name === 'Revenue' ? [fmt(val), 'Revenue'] : [val, 'Invoices Processed']
                  }
                />
                <Bar dataKey="Invoices" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Peak Hours Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-line bg-paper-alt">
          <h2 className="text-sm font-bold">24-Hour Traffic & Counter Staffing Schedule</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Hour Window</th>
                <th className="text-right">Total Invoices</th>
                <th className="text-right">Total Revenue</th>
                <th className="text-right">Avg Ticket</th>
                <th>Rush Level & Recommended Staffing</th>
              </tr>
            </thead>
            <tbody>
              {peakHours.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-ink-soft">
                    No records found.
                  </td>
                </tr>
              ) : (
                peakHours.map((h: any, idx: number) => {
                  const isPeak = h.totalInvoices >= 10;
                  const isModerate = h.totalInvoices >= 4 && h.totalInvoices < 10;
                  return (
                    <tr key={idx} className="hover:bg-paper-alt">
                      <td className="font-semibold text-xs">{h.hourLabel}</td>
                      <td className="text-right font-mono text-xs font-bold">{h.totalInvoices}</td>
                      <td className="text-right font-mono text-xs">{fmt(h.totalRevenue)}</td>
                      <td className="text-right font-mono text-xs">{fmt(h.avgRevenue)}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1 ${
                            isPeak
                              ? 'bg-cherry text-white'
                              : isModerate
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-paper text-ink-soft border border-line'
                          }`}
                        >
                          {isPeak && <Flame size={11} />}
                          {isPeak
                            ? 'High Rush (2+ Counter Staff)'
                            : isModerate
                            ? 'Moderate Rush (1-2 Counter Staff)'
                            : 'Normal (1 Counter Staff)'}
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
