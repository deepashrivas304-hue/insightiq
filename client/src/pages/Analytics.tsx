import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, download } from '../api';
import { useAuth } from '../auth';
import { Card, ChartCard, ChartView, DataTable, EmptyState, ErrorBox, PageHeader, Skeleton, toast, useAsync } from '../ui';
import type { ChartType, Column, Dataset, Filter, QueryState } from '../types';

export const emptyQuery = (): QueryState => ({ datasetId: '', agg: 'SUM', filters: [], limit: 50, sort: 'label_asc' });
export function useColumns(datasetId?: string) {
  const r = useAsync(() => (datasetId ? api(`/datasets/${datasetId}/columns`) : Promise.resolve(null)), [datasetId]);
  return { columns: (r.data?.columns ?? []) as Column[], mapping: (r.data?.mapping ?? {}) as Record<string, string>, loading: r.loading };
}
export const cleanQuery = (q: QueryState) => ({ ...q, dimension: q.dimension || undefined, measure: q.measure || undefined, bucket: q.dimension && q.bucket ? q.bucket : undefined, from: q.from || undefined, to: q.to || undefined, filters: q.filters.filter(f => f.field && String(f.value) !== '') });
export function compat(q: QueryState, cols: Column[]): string | null {
  if (!q.datasetId) return 'Select a dataset.';
  const t = cols.find(c => c.name === q.measure)?.type;
  if (q.agg !== 'COUNT' && !q.measure) return `${q.agg} needs a measure.`;
  if (q.measure && q.agg !== 'COUNT' && t !== 'number') return `${q.agg} only works on numeric fields. Pick a numeric measure or use COUNT.`;
  return null;
}
export function QueryForm({ q, setQ }: { q: QueryState; setQ: (q: QueryState) => void }) {
  const list = useAsync(() => api('/datasets?limit=100'), []), { columns, mapping } = useColumns(q.datasetId);
  const datasets: Dataset[] = list.data?.items ?? [];
  useEffect(() => { if (!q.datasetId && datasets.length) setQ({ ...q, datasetId: datasets.find(d => d.status === 'READY')?.id ?? datasets[0].id }); }, [datasets]); // eslint-disable-line
  useEffect(() => { if (q.datasetId && columns.length && !q.measure && !q.dimension) setQ({ ...q, dimension: mapping.category ?? mapping.date, bucket: mapping.category ? undefined : 'month', measure: mapping.revenue, dateField: mapping.date }); }, [columns]); // eslint-disable-line
  const set = (p: Partial<QueryState>) => setQ({ ...q, ...p });
  const dimCol = columns.find(c => c.name === q.dimension), numeric = columns.filter(c => c.type === 'number');
  const setFilter = (i: number, p: Partial<Filter>) => set({ filters: q.filters.map((f, j) => (j === i ? ({ ...f, ...p } as Filter) : f)) });
  if (list.loading) return <Skeleton h="h-32" />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!datasets.length) return <EmptyState title="No datasets available" hint="Import or load the demo dataset first (Data Sources)." />;
  return (<div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div><label className="label">Dataset</label><select className="input" aria-label="Dataset" value={q.datasetId} onChange={e => setQ({ ...emptyQuery(), datasetId: e.target.value })}>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    <div><label className="label">Dimension (group by)</label><select className="input" aria-label="Dimension" value={q.dimension ?? ''} onChange={e => set({ dimension: e.target.value || undefined, bucket: columns.find(c => c.name === e.target.value)?.type === 'date' ? 'month' : undefined })}><option value="">None (single total)</option>{columns.map(c => <option key={c.name}>{c.name}</option>)}</select></div>
    {dimCol?.type === 'date' && <div><label className="label">Time bucket</label><select className="input" aria-label="Time bucket" value={q.bucket ?? 'month'} onChange={e => set({ bucket: e.target.value })}>{['day', 'week', 'month', 'quarter', 'year'].map(b => <option key={b}>{b}</option>)}</select></div>}
    <div><label className="label">Measure</label><select className="input" aria-label="Measure" value={q.measure ?? ''} onChange={e => set({ measure: e.target.value || undefined })}><option value="">{q.agg === 'COUNT' ? 'Rows' : 'Select…'}</option>{(q.agg === 'COUNT' ? columns : numeric).map(c => <option key={c.name}>{c.name}</option>)}</select></div>
    <div><label className="label">Aggregation</label><select className="input" aria-label="Aggregation" value={q.agg} onChange={e => set({ agg: e.target.value })}>{['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].map(a => <option key={a}>{a}</option>)}</select></div>
    <div><label className="label">Sort</label><select className="input" aria-label="Sort" value={q.sort} onChange={e => set({ sort: e.target.value })}><option value="label_asc">By label</option><option value="value_desc">Value high→low</option><option value="value_asc">Value low→high</option></select></div>
    <div><label className="label">From</label><input type="date" className="input" value={q.from ?? ''} onChange={e => set({ from: e.target.value || undefined, dateField: mapping.date })} /></div>
    <div><label className="label">To</label><input type="date" className="input" value={q.to ?? ''} onChange={e => set({ to: e.target.value || undefined, dateField: mapping.date })} /></div></div>
    <div>{q.filters.map((f, i) => <div key={i} className="mb-2 flex flex-wrap gap-2"><select className="input w-44" aria-label="Filter field" value={f.field} onChange={e => setFilter(i, { field: e.target.value })}><option value="">Field…</option>{columns.map(c => <option key={c.name}>{c.name}</option>)}</select>
      <select className="input w-28" aria-label="Filter operator" value={f.op} onChange={e => setFilter(i, { op: e.target.value as Filter['op'] })}><option value="eq">equals</option><option value="gte">≥</option><option value="lte">≤</option></select>
      <input className="input w-44" aria-label="Filter value" value={String(f.value)} onChange={e => setFilter(i, { value: e.target.value })} /><button className="text-sm text-red-600" onClick={() => set({ filters: q.filters.filter((_, j) => j !== i) })}>Remove</button></div>)}
      <button className="text-sm font-medium text-brand-600" onClick={() => set({ filters: [...q.filters, { field: '', op: 'eq', value: '' }] })}>+ Add filter</button></div>
    {compat(q, columns) && <p className="text-xs text-amber-700">{compat(q, columns)}</p>}</div>);
}
const CHARTS: ChartType[] = ['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'table', 'kpi'];
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export function ExplorerPage() {
  const { can } = useAuth();
  const [q, setQ] = useState<QueryState>(emptyQuery()), [type, setType] = useState<ChartType>('bar'), [title, setTitle] = useState('My chart'), [target, setTarget] = useState('new');
  const [run, setRun] = useState<{ data: any[]; label: string } | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const { columns } = useColumns(q.datasetId), dashboards = useAsync(() => api('/dashboards'), []);
  const exec = async () => { setBusy(true); setErr(''); try { const r = await api('/analytics/query', { body: cleanQuery(q) }); setRun({ data: r.data, label: `${q.agg}(${q.measure ?? '*'})` }); } catch (x: any) { setErr(x.message); } setBusy(false); };
  const exp = (format: string) => download('/reports/export', { ...cleanQuery(q), format, title }, `export.${format}`).catch((x: any) => toast(x.message, true));
  const save = async () => {
    const w = { ...cleanQuery(q), id: newId(), title, type, width: 1, agg: q.agg === 'COUNT_DISTINCT' ? 'COUNT' : q.agg };
    try { if (target === 'new') { const name = window.prompt('Name for the new dashboard', 'My dashboard'); if (!name) return; await api('/dashboards', { body: { name, widgets: [w] } }); } else { const d = (await api(`/dashboards/${target}`)).dashboard; await api(`/dashboards/${target}`, { method: 'PUT', body: { name: d.name, description: d.description, widgets: [...d.widgets, w] } }); }
      toast('Saved to dashboard'); dashboards.reload(); } catch (x: any) { toast(x.message, true); }
  };
  return (<div><PageHeader title="Analytics Explorer" subtitle="Pick fields, run a safe query, visualise it, export it or save it to a dashboard." />
    <Card className="mb-4"><QueryForm q={q} setQ={setQ} /><div className="mt-3 flex flex-wrap items-end gap-3"><div><label className="label">Chart type</label><select className="input w-36" aria-label="Chart type" value={type} onChange={e => setType(e.target.value as ChartType)}>{CHARTS.map(c => <option key={c}>{c}</option>)}</select></div>
      <button className="btn" onClick={exec} disabled={busy || !!compat(q, columns)}>{busy ? 'Running…' : 'Run analysis'}</button></div></Card>
    {err && <ErrorBox message={err} />}
    {run && <ChartCard title={title} actions={<div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => exp('csv')}><Download className="h-4 w-4" />CSV</button><button className="btn-ghost" onClick={() => exp('xlsx')}><Download className="h-4 w-4" />XLSX</button><button className="btn-ghost" onClick={() => exp('pdf')}><Download className="h-4 w-4" />PDF</button></div>}>
      <ChartView type={type} data={run.data} label={run.label} />
      {type !== 'table' && run.data.length > 0 && <div className="mt-4 max-h-56 overflow-auto"><DataTable rows={run.data} cols={[{ key: 'label', header: q.dimension ?? 'Group' }, { key: 'value', header: run.label, align: 'right', render: (r: any) => r.value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }]} /></div>}
      {can('ADMIN', 'ANALYST') && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"><div><label className="label">Widget title</label><input className="input w-52" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><label className="label">Save to</label><select className="input w-52" aria-label="Save to dashboard" value={target} onChange={e => setTarget(e.target.value)}><option value="new">New dashboard…</option>{dashboards.data?.items.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><button className="btn" onClick={save}>Save to dashboard</button></div>}</ChartCard>}</div>);
}

export function ReportsPage() {
  const [q, setQ] = useState<QueryState>(emptyQuery()), [format, setFormat] = useState('pdf'), [title, setTitle] = useState('Sales report'), [busy, setBusy] = useState(false);
  const { columns } = useColumns(q.datasetId);
  const go = async () => { setBusy(true); try { await download('/reports/export', { ...cleanQuery(q), format, title }, `report.${format}`); toast('Report downloaded'); } catch (x: any) { toast(x.message, true); } setBusy(false); };
  return (<div><PageHeader title="Reports" subtitle="Export the current dataset, filters and date range as a real PDF, XLSX or CSV file." />
    <Card><QueryForm q={q} setQ={setQ} /><div className="mt-3 flex flex-wrap items-end gap-3"><div><label className="label">Report title</label><input className="input w-64" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><label className="label">Format</label><select className="input w-28" aria-label="Format" value={format} onChange={e => setFormat(e.target.value)}><option value="pdf">PDF</option><option value="xlsx">XLSX</option><option value="csv">CSV</option></select></div>
      <button className="btn" onClick={go} disabled={busy || !!compat(q, columns)}><Download className="h-4 w-4" />{busy ? 'Generating…' : 'Download report'}</button></div>
      <p className="mt-3 text-xs text-slate-500">To export raw records, open a dataset and use its CSV / XLSX buttons. Text cells starting with = + - @ are escaped to prevent formula injection.</p></Card></div>);
}
