import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  Percent,
  RefreshCw,
  Calendar,
  Layers,
  Building,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi, locationsApi, categoriesApi } from '../../api/client';
import { exportToExcel, exportToCsv } from '../../utils/xlsxExport';

const today = new Date().toISOString().split('T')[0];
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const ProfitMarginReportPage: React.FC = () => {
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeTab, setActiveTab] = useState<'daily' | 'categories' | 'locations'>('daily');

  const { data: locData } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list() });
  const locations: any[] = Array.isArray(locData) ? locData : (locData?.data ?? []);

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list() });
  const categories: any[] = Array.isArray(catData) ? catData : (catData?.data ?? []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-profit-margin', from, to, locationId, categoryId],
    queryFn: () =>
      reportsApi.profitMargin({
        from,
        to,
        locationId: locationId || undefined,
        categoryId: categoryId || undefined,
      }),
  });

  const report = data?.data ?? {
    totalRevenue: 0,
    totalCogs: 0,
    totalGrossProfit: 0,
    overallMarginPercent: 0,
    dailyBreakdown: [],
    categoryBreakdown: [],
    locationBreakdown: [],
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
    if (activeTab === 'daily') {
      const headers = ['Date', 'Location', 'Items Sold', 'Invoices', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.dailyBreakdown || []).map((r: any) => [
        new Date(r.date).toLocaleDateString('en-IN'),
        r.locationName,
        r.itemsSold,
        r.invoicesCount,
        Number(r.revenue.toFixed(2)),
        Number(r.costOfGoodsSold.toFixed(2)),
        Number(r.grossProfit.toFixed(2)),
        Number(r.grossProfitMarginPercent.toFixed(2)),
      ]);
      exportToExcel(`profit_margin_daily_${from}_to_${to}`, 'Daily_P&L', headers, rows);
    } else if (activeTab === 'categories') {
      const headers = ['Category', 'Items Sold', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.categoryBreakdown || []).map((c: any) => [
        c.categoryName,
        c.itemsSold,
        Number(c.revenue.toFixed(2)),
        Number(c.costOfGoodsSold.toFixed(2)),
        Number(c.grossProfit.toFixed(2)),
        Number(c.grossProfitMarginPercent.toFixed(2)),
      ]);
      exportToExcel(`profit_margin_by_category_${from}_to_${to}`, 'Category_Margins', headers, rows);
    } else {
      const headers = ['Location', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.locationBreakdown || []).map((l: any) => [
        l.locationName,
        Number(l.revenue.toFixed(2)),
        Number(l.costOfGoodsSold.toFixed(2)),
        Number(l.grossProfit.toFixed(2)),
        Number(l.grossProfitMarginPercent.toFixed(2)),
      ]);
      exportToExcel(`profit_margin_by_location_${from}_to_${to}`, 'Location_Margins', headers, rows);
    }
    toast.success('P&L report exported to Excel (.xlsx)!');
  };

  const handleExportCsv = () => {
    if (activeTab === 'daily') {
      const headers = ['Date', 'Location', 'Items Sold', 'Invoices', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.dailyBreakdown || []).map((r: any) => [
        new Date(r.date).toLocaleDateString('en-IN'),
        r.locationName,
        r.itemsSold,
        r.invoicesCount,
        r.revenue.toFixed(2),
        r.costOfGoodsSold.toFixed(2),
        r.grossProfit.toFixed(2),
        r.grossProfitMarginPercent.toFixed(2),
      ]);
      exportToCsv(`profit_margin_daily_${from}_to_${to}`, headers, rows);
    } else if (activeTab === 'categories') {
      const headers = ['Category', 'Items Sold', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.categoryBreakdown || []).map((c: any) => [
        c.categoryName,
        c.itemsSold,
        c.revenue.toFixed(2),
        c.costOfGoodsSold.toFixed(2),
        c.grossProfit.toFixed(2),
        c.grossProfitMarginPercent.toFixed(2),
      ]);
      exportToCsv(`profit_margin_by_category_${from}_to_${to}`, headers, rows);
    } else {
      const headers = ['Location', 'Gross Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin (%)'];
      const rows = (report.locationBreakdown || []).map((l: any) => [
        l.locationName,
        l.revenue.toFixed(2),
        l.costOfGoodsSold.toFixed(2),
        l.grossProfit.toFixed(2),
        l.grossProfitMarginPercent.toFixed(2),
      ]);
      exportToCsv(`profit_margin_by_location_${from}_to_${to}`, headers, rows);
    }
    toast.success('P&L report exported to CSV!');
  };

  // Chart data formatting
  const chartData = (report.dailyBreakdown || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    Revenue: d.revenue,
    COGS: d.costOfGoodsSold,
    Profit: d.grossProfit,
    Margin: d.grossProfitMarginPercent,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Profit & Margin Report (P&L)</h1>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-teal-soft text-teal border border-teal rounded-full">
              P&L Real-time
            </span>
          </div>
          <p className="text-sm text-ink-soft mt-0.5">
            View Gross Revenue, Cost of Goods Sold (COGS), and Gross Profit Margin % across dates, categories, and locations.
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
            { label: 'Last 90 Days', days: 90 },
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

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input text-xs w-full"
            >
              <option value="">All Categories</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 border-l-4 border-l-teal">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Gross Revenue</span>
            <DollarSign size={16} className="text-teal" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1">{fmt(report.totalRevenue)}</p>
          <p className="text-xs text-ink-soft mt-1">Total customer billing before costs</p>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Cost of Goods (COGS)</span>
            <Package size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1">{fmt(report.totalCogs)}</p>
          <p className="text-xs text-ink-soft mt-1">Total acquisition / inventory cost</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Gross Profit</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-emerald-700">{fmt(report.totalGrossProfit)}</p>
          <p className="text-xs text-ink-soft mt-1">Gross Revenue minus COGS</p>
        </div>

        <div className="card p-4 border-l-4 border-l-purple-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">Gross Profit Margin %</span>
            <Percent size={16} className="text-purple-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-bold font-mono text-purple-700">{report.overallMarginPercent}%</p>
            <span
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                report.overallMarginPercent >= 40
                  ? 'bg-emerald-100 text-emerald-800'
                  : report.overallMarginPercent >= 20
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {report.overallMarginPercent >= 40 ? 'Healthy' : report.overallMarginPercent >= 20 ? 'Moderate' : 'Tight'}
            </span>
          </div>
          <p className="text-xs text-ink-soft mt-1">(Gross Profit / Gross Revenue) × 100</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">Revenue, COGS & Profit Trend</h2>
            <p className="text-xs text-ink-soft">Daily comparison of top-line sales vs product acquisition costs</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">Loading trend data...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-ink-soft text-sm">
            No sales recorded in the selected period.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any, name: any) =>
                    name === 'Margin' ? [`${val}%`, 'Margin %'] : [fmt(val), name]
                  }
                />
                <Legend />
                <Bar yAxisId="left" dataKey="Revenue" fill="#0D9488" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="COGS" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Margin"
                  stroke="#9333EA"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabbed Breakdown Tables */}
      <div className="card overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-line bg-paper-alt px-4 pt-3 gap-3">
          <button
            onClick={() => setActiveTab('daily')}
            className={`pb-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'daily'
                ? 'border-teal text-teal'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Calendar size={13} />
            Daily Breakdown ({report.dailyBreakdown?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-teal text-teal'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Layers size={13} />
            Profitability by Category ({report.categoryBreakdown?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`pb-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'locations'
                ? 'border-teal text-teal'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Building size={13} />
            Profitability by Location ({report.locationBreakdown?.length || 0})
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-x-auto">
          {activeTab === 'daily' && (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Location</th>
                  <th className="text-right">Items Sold</th>
                  <th className="text-right">Invoices</th>
                  <th className="text-right">Gross Revenue</th>
                  <th className="text-right">COGS</th>
                  <th className="text-right">Gross Profit</th>
                  <th className="text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {report.dailyBreakdown?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-ink-soft">
                      No daily records found.
                    </td>
                  </tr>
                ) : (
                  report.dailyBreakdown?.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-paper-alt">
                      <td className="font-mono text-xs">{new Date(row.date).toLocaleDateString('en-IN')}</td>
                      <td className="font-medium text-xs">{row.locationName}</td>
                      <td className="text-right font-mono text-xs">{row.itemsSold}</td>
                      <td className="text-right font-mono text-xs">{row.invoicesCount}</td>
                      <td className="text-right font-mono text-xs font-semibold">{fmt(row.revenue)}</td>
                      <td className="text-right font-mono text-xs text-amber-700">{fmt(row.costOfGoodsSold)}</td>
                      <td className="text-right font-mono text-xs font-semibold text-emerald-700">
                        {fmt(row.grossProfit)}
                      </td>
                      <td className="text-right font-mono text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            row.grossProfitMarginPercent >= 40
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.grossProfitMarginPercent >= 20
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {row.grossProfitMarginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'categories' && (
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">Items Sold</th>
                  <th className="text-right">Gross Revenue</th>
                  <th className="text-right">COGS</th>
                  <th className="text-right">Gross Profit</th>
                  <th className="text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {report.categoryBreakdown?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-ink-soft">
                      No category records found.
                    </td>
                  </tr>
                ) : (
                  report.categoryBreakdown?.map((cat: any, idx: number) => (
                    <tr key={idx} className="hover:bg-paper-alt">
                      <td className="font-semibold text-xs flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-teal" />
                        {cat.categoryName}
                      </td>
                      <td className="text-right font-mono text-xs">{cat.itemsSold}</td>
                      <td className="text-right font-mono text-xs font-semibold">{fmt(cat.revenue)}</td>
                      <td className="text-right font-mono text-xs text-amber-700">{fmt(cat.costOfGoodsSold)}</td>
                      <td className="text-right font-mono text-xs font-semibold text-emerald-700">
                        {fmt(cat.grossProfit)}
                      </td>
                      <td className="text-right font-mono text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            cat.grossProfitMarginPercent >= 40
                              ? 'bg-emerald-100 text-emerald-800'
                              : cat.grossProfitMarginPercent >= 20
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {cat.grossProfitMarginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'locations' && (
            <table className="table">
              <thead>
                <tr>
                  <th>Location Name</th>
                  <th className="text-right">Gross Revenue</th>
                  <th className="text-right">COGS</th>
                  <th className="text-right">Gross Profit</th>
                  <th className="text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {report.locationBreakdown?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-ink-soft">
                      No location records found.
                    </td>
                  </tr>
                ) : (
                  report.locationBreakdown?.map((loc: any, idx: number) => (
                    <tr key={idx} className="hover:bg-paper-alt">
                      <td className="font-semibold text-xs">{loc.locationName}</td>
                      <td className="text-right font-mono text-xs font-semibold">{fmt(loc.revenue)}</td>
                      <td className="text-right font-mono text-xs text-amber-700">{fmt(loc.costOfGoodsSold)}</td>
                      <td className="text-right font-mono text-xs font-semibold text-emerald-700">
                        {fmt(loc.grossProfit)}
                      </td>
                      <td className="text-right font-mono text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            loc.grossProfitMarginPercent >= 40
                              ? 'bg-emerald-100 text-emerald-800'
                              : loc.grossProfitMarginPercent >= 20
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {loc.grossProfitMarginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
