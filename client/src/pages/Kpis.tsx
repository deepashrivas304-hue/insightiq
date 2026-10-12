import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, ChartView, EmptyState, ErrorBox, inr, num, PageHeader, pct, Skeleton, toast, useAsync } from '../ui';
import { useColumns } from './Analytics';

const STATUS: Record<string, string> = { Achieved: 'bg-emerald-100 text-emerald-800', 'On Track': 'bg-blue-100 text-blue-800', 'At Risk': 'bg-amber-100 text-amber-800', 'Below Target': 'bg-red-100 text-red-800' };
const BAR: Record<string, string> = { Achieved: 'bg-emerald-500', 'On Track': 'bg-blue-500', 'At Risk': 'bg-amber-500', 'Below Target': 'bg-red-500' };
const money = (n: string) => /revenue|profit|cost|sales|amount|price/i.test(n);
const empty = { name: '', datasetId: '', measure: '', aggregation: 'SUM', target: 0, warningPct: 80, period: 'month' };

function KpiForm({ init, onDone, onCancel }: { init: any; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(init), [busy, setBusy] = useState(false);
  const datasets = useAsync(() => api('/datasets?limit=100'), []), { columns } = useColumns(f.datasetId);
  const set = (p: any) => setF({ ...f, ...p });
  const ds = f.datasetId || datasets.data?.items?.[0]?.id || '';
  const opts = f.aggregation === 'COUNT' ? columns : columns.filter(c => c.type === 'number');
  const save = async () => { setBusy(true); try { const body = { name: f.name, datasetId: ds, measure: f.measure, aggregation: f.aggregation, target: Number(f.target), warningPct: Number(f.warningPct), period: f.period }; f.id ? await api(`/kpis/${f.id}`, { method: 'PUT', body }) : await api('/kpis', { body }); toast('KPI saved'); onDone(); } catch (x: any) { toast(x.message, true); } setBusy(false); };
  return (<Card title={f.id ? 'Edit KPI' : 'New KPI'} className="mb-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div><label className="label" htmlFor="kn">Name</label><input id="kn" className="input" value={f.name} onChange={e => set({ name: e.target.value })} /></div>
    <div><label className="label">Dataset</label><select className="input" aria-label="Dataset" value={ds} onChange={e => set({ datasetId: e.target.value, measure: '' })}>{datasets.data?.items.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    <div><label className="label">Aggregation</label><select className="input" aria-label="Aggregation" value={f.aggregation} onChange={e => set({ aggregation: e.target.value, measure: '' })}>{['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].map(a => <option key={a}>{a}</option>)}</select></div>
    <div><label className="label">Measure</label><select className="input" aria-label="Measure" value={f.measure} onChange={e => set({ measure: e.target.value })}><option value="">Select…</option>{opts.map(c => <option key={c.name}>{c.name}</option>)}</select></div>
    <div><label className="label" htmlFor="kt">Target value</label><input id="kt" type="number" min={0} className="input" value={f.target} onChange={e => set({ target: e.target.value })} /></div>
    <div><label className="label" htmlFor="kw">Warning threshold (% of target)</label><input id="kw" type="number" min={1} max={100} className="input" value={f.warningPct} onChange={e => set({ warningPct: e.target.value })} /></div>
    <div><label className="label">Comparison period</label><select className="input" aria-label="Period" value={f.period} onChange={e => set({ period: e.target.value })}><option value="month">Latest month</option><option value="quarter">Latest quarter</option><option value="year">Latest year</option><option value="all">All time</option></select></div></div>
    <div className="mt-3 flex gap-2"><button className="btn" onClick={save} disabled={busy || !f.name.trim() || !f.measure || !(Number(f.target) > 0)}>{busy ? 'Saving…' : 'Save KPI'}</button><button className="btn-ghost" onClick={onCancel}>Cancel</button></div></Card>);
}
export default function KpiPage() {
  const { can } = useAuth(), { data, loading, error, reload } = useAsync(() => api('/kpis'), []), [form, setForm] = useState<any>(null);
  const del = async (k: any) => { if (!window.confirm(`Delete KPI "${k.name}"?`)) return; try { await api(`/kpis/${k.id}`, { method: 'DELETE' }); toast('KPI deleted'); reload(); } catch (x: any) { toast(x.message, true); } };
  return (<div><PageHeader title="KPI Center" subtitle="Track performance against targets. Periods end at the latest date in each dataset." actions={can('ADMIN', 'ANALYST') ? <button className="btn" onClick={() => setForm(empty)}><Plus className="h-4 w-4" />New KPI</button> : undefined} />
    {form && <KpiForm init={form} onCancel={() => setForm(null)} onDone={() => { setForm(null); reload(); }} />}
    {loading ? <Skeleton h="h-40" /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data.items.length ? <Card><EmptyState title="No KPIs defined" hint="Create a KPI with a target, for example Monthly Revenue." /></Card> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.map((k: any) => { const f = (v: number) => (money(k.measure) ? inr(v) : num(v, 2)); return (
        <Card key={k.id}><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-ink">{k.name}</h3><p className="text-xs text-slate-500">{k.aggregation}({k.measure}) · {k.period === 'all' ? 'all time' : `latest ${k.period}`}</p></div><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[k.status]}`}>{k.status}</span></div>
          <p className="mt-3 text-2xl font-semibold">{f(k.current)} <span className="text-sm font-normal text-slate-500">of {f(k.target)}</span></p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={Math.round(k.achievement)} aria-valuemin={0} aria-valuemax={100} aria-label={`${k.name} progress`}><div className={`h-full ${BAR[k.status]}`} style={{ width: `${Math.min(100, Math.max(0, k.achievement))}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">Target achievement {pct(k.achievement)}</p>
          {k.trend.length > 1 && <div className="mt-2"><ChartView type="line" data={k.trend} height={110} label={k.measure} /></div>}
          {can('ADMIN', 'ANALYST') && <div className="mt-3 flex gap-2"><button className="btn-ghost" onClick={() => setForm({ id: k.id, name: k.name, datasetId: k.datasetId, measure: k.measure, aggregation: k.aggregation, target: k.target, warningPct: k.warningPct, period: k.period })}><Pencil className="h-4 w-4" />Edit</button><button className="btn-ghost text-red-600" onClick={() => del(k)}><Trash2 className="h-4 w-4" />Delete</button></div>}</Card>); })}</div>}</div>);
}
