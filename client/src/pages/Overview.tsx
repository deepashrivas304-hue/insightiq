import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { api, download } from '../api';
import { useAuth } from '../auth';
import { ChartCard, ChartView, EmptyState, ErrorBox, inr, KpiCard, num, PageHeader, pct, Skeleton, toast, useAsync, Card } from '../ui';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function presetRange(p: string, max: string): [string | undefined, string | undefined] {
  const y = +max.slice(0, 4), m = +max.slice(5, 7) - 1, iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case 'today': return [max, max]; case '7d': return [addDays(max, -6), max]; case '30d': return [addDays(max, -29), max]; case '90d': return [addDays(max, -89), max];
    case 'month': return [`${max.slice(0, 7)}-01`, max]; case 'prevmonth': return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
    case 'quarter': return [iso(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))), max]; case 'year': return [`${y}-01-01`, max]; default: return [undefined, undefined];
  }
}
const PRESETS: [string, string][] = [['today', 'Latest day'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['month', 'This month'], ['prevmonth', 'Previous month'], ['quarter', 'This quarter'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom range']];
const FILTER_ROLES: [string, string][] = [['region', 'Region'], ['category', 'Category'], ['product', 'Product'], ['channel', 'Sales channel'], ['segment', 'Customer segment']];

function FilterSelect({ datasetId, field, label, value, onChange }: { datasetId: string; field: string; label: string; value?: string; onChange: (v: string) => void }) {
  const { data } = useAsync(() => api(`/datasets/${datasetId}/distinct?field=${encodeURIComponent(field)}`), [datasetId, field]);
  return <div><label className="label">{label}</label><select className="input w-40" value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={label}><option value="">All</option>{data?.values.map((v: string) => <option key={v}>{v}</option>)}</select></div>;
}
export default function Overview() {
  const { can } = useAuth();
  const list = useAsync(() => api('/datasets?limit=100'), []);
  const [dsId, setDsId] = useState(localStorage.getItem('iq_ds') ?? ''), [preset, setPreset] = useState('90d'), [from, setFrom] = useState<string>(), [to, setTo] = useState<string>(), [compare, setCompare] = useState(true), [filters, setFilters] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const datasets: any[] = list.data?.items ?? [];
  useEffect(() => { if (datasets.length && !datasets.find(d => d.id === dsId)) setDsId((datasets.find(d => d.status === 'READY') ?? datasets[0]).id); }, [datasets, dsId]);
  useEffect(() => { if (dsId) { localStorage.setItem('iq_ds', dsId); setFilters({}); } }, [dsId]);
  const range = useAsync(() => (dsId ? api(`/datasets/${dsId}/range`) : Promise.resolve(null)), [dsId]);
  const max: string | null = range.data?.max ?? null;
  useEffect(() => { if (preset !== 'custom' && max) { const [f, t] = presetRange(preset, max); setFrom(f); setTo(t); } }, [preset, max]);
  const ds = datasets.find(d => d.id === dsId), M: Record<string, string> = ds?.mapping ?? {};
  const fList = useMemo(() => Object.entries(filters).filter(([, v]) => v).map(([role, value]) => ({ field: M[role], op: 'eq', value })), [filters, M]);
  const ready = !!dsId && !range.loading && (!!max || preset === 'all' || preset === 'custom');
  const ov = useAsync(() => (ready ? api(`/analytics/overview?datasetId=${dsId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}${fList.length ? `&filters=${encodeURIComponent(JSON.stringify(fList))}` : ''}`) : Promise.resolve(null)), [ready, dsId, from, to, JSON.stringify(fList)]);
  const loadDemo = async () => { setBusy(true); try { const r = await api('/datasets/demo', { method: 'POST', body: {} }); setDsId(r.dataset.id); toast('Demo data loaded'); list.reload(); } catch (x: any) { toast(x.message, true); } setBusy(false); };
  const exportPdf = async () => { try { await download('/reports/export', { datasetId: dsId, dimension: M.date, bucket: 'month', measure: M.revenue, agg: 'SUM', dateField: M.date, from, to, filters: fList, format: 'pdf', title: `Business Overview - ${ds?.name}` }, 'report.pdf'); } catch (x: any) { toast(x.message, true); } };
  const d = ov.data, k = d?.kpis, drill = (role: string) => (label: string) => setFilters(f => ({ ...f, [role]: label }));

  return (<div>
    <PageHeader title="Business Overview" subtitle="Monitor performance, track business goals, and discover insights." actions={<>
      <button className="btn-ghost" onClick={() => { list.reload(); ov.reload(); }}><RefreshCw className="h-4 w-4" />Refresh data</button>
      <button className="btn-ghost" onClick={exportPdf} disabled={!d}><Download className="h-4 w-4" />Export report</button>
      <Link className="btn-ghost" to="/dashboards"><SlidersHorizontal className="h-4 w-4" />Customize dashboard</Link></>} />
    {list.loading ? <Skeleton h="h-64" /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !datasets.length ?
      <Card><EmptyState title="No datasets yet" hint="Import a CSV, Excel or JSON file, or load the sample sales dataset to explore InsightIQ." action={<div className="mt-2 flex gap-2">{can('ADMIN', 'ANALYST') && <button className="btn" onClick={loadDemo} disabled={busy}>Load demo data</button>}<Link className="btn-ghost" to="/data-sources">Import data</Link></div>} /></Card> : <>
      <Card className="mb-4"><div className="flex flex-wrap items-end gap-3">
        <div><label className="label">Dataset</label><select className="input w-56" aria-label="Dataset" value={dsId} onChange={e => setDsId(e.target.value)}>{datasets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label className="label">Date range</label><select className="input w-40" aria-label="Date range" value={preset} onChange={e => setPreset(e.target.value)}>{PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {preset === 'custom' && <><div><label className="label">From</label><input type="date" className="input" value={from ?? ''} onChange={e => setFrom(e.target.value || undefined)} /></div><div><label className="label">To</label><input type="date" className="input" value={to ?? ''} onChange={e => setTo(e.target.value || undefined)} /></div></>}
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />Compare with previous period</label>
        {FILTER_ROLES.filter(([r]) => M[r]).map(([r, l]) => <FilterSelect key={r + dsId} datasetId={dsId} field={M[r]} label={l} value={filters[r]} onChange={v => setFilters(f => ({ ...f, [r]: v }))} />)}
      </div>
      <p className="mt-2 text-xs text-slate-500">Date ranges are relative to the latest date in the dataset{max ? ` (${max})` : ''}.{ds?.isDemo && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Demo data</span>}</p>
      {Object.entries(filters).some(([, v]) => v) && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(filters).filter(([, v]) => v).map(([r, v]) => <button key={r} className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700" onClick={() => setFilters(f => ({ ...f, [r]: '' }))}>{r}: {v}<X className="h-3 w-3" /></button>)}</div>}</Card>
      {ov.error ? <ErrorBox message={ov.error} onRetry={ov.reload} /> : ov.loading || !d ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} h="h-24" />)}</div> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Total Revenue" value={inr(k.revenue.value)} change={k.revenue.change} showChange={compare} hint={compare ? 'vs previous period' : undefined} />
          <KpiCard label="Total Profit" value={inr(k.profit.value)} change={k.profit.change} showChange={compare} hint={k.profit.value === null ? 'Map a cost or profit column' : undefined} />
          <KpiCard label="Total Orders" value={num(k.orders.value)} change={k.orders.change} showChange={compare} />
          <KpiCard label="Average Order Value" value={inr(k.aov.value)} change={k.aov.change} showChange={compare} />
          <KpiCard label="Profit Margin" value={pct(k.margin.value)} change={k.margin.change} showChange={compare} />
          <KpiCard label="Revenue Growth" value={pct(k.growth.value)} hint={k.growth.value === null ? 'No previous period data' : 'vs previous period'} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title={`Revenue Trend (by ${d.bucket})`}><ChartView type="line" data={d.trend.current} label="Revenue" money previous={compare && d.trend.previous.length ? d.trend.previous.map((p: any) => p.value) : undefined} /></ChartCard>
          <ChartCard title="Order Trends"><ChartView type="line" data={d.ordersTrend} label="Orders" /></ChartCard>
          {d.byCategory && <ChartCard title="Sales Performance by Category" actions={<span className="text-xs text-slate-400">Click a bar to filter</span>}><ChartView type="bar" data={d.byCategory} label="Revenue" money onSelect={drill('category')} /></ChartCard>}
          {d.byCategory && <ChartCard title="Revenue Distribution"><ChartView type="doughnut" data={d.byCategory} label="Revenue" money /></ChartCard>}
          <ChartCard title="Profit Analysis">{d.profitTrend ? <ChartView type="bar" data={d.profitTrend} label="Profit" money /> : <EmptyState title="Profit needs a cost or profit column" hint="Map one in the dataset import step." />}</ChartCard>
          {d.byRegion && <ChartCard title="Regional Performance"><ChartView type="bar" data={d.byRegion} label="Revenue" money onSelect={drill('region')} /></ChartCard>}
          {d.byProduct && <ChartCard title="Top Products by Revenue"><ChartView type="hbar" data={d.byProduct} label="Revenue" money height={320} onSelect={drill('product')} /></ChartCard>}
          {d.byChannel && <ChartCard title="Sales Channels"><ChartView type="pie" data={d.byChannel} label="Revenue" money onSelect={drill('channel')} /></ChartCard>}
          {d.customers && <ChartCard title="Customer Analysis"><div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-semibold">{num(d.customers.unique)}</p><p className="text-xs text-slate-500">Customers</p></div><div><p className="text-2xl font-semibold">{num(d.customers.repeat)}</p><p className="text-xs text-slate-500">Repeat customers</p></div><div><p className="text-2xl font-semibold">{pct(d.customers.unique ? (d.customers.repeat / d.customers.unique) * 100 : null)}</p><p className="text-xs text-slate-500">Repeat rate</p></div></div>
            <ChartView type="doughnut" height={180} label="Customers" data={[{ label: 'One-time', value: d.customers.unique - d.customers.repeat }, { label: 'Repeat', value: d.customers.repeat }]} /></ChartCard>}
        </div></>}</>}
  </div>);
}
