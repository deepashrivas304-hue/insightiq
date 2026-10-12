import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, ChartCard, ChartView, EmptyState, ErrorBox, PageHeader, Skeleton, toast, useAsync } from '../ui';
import { cleanQuery, compat, emptyQuery, QueryForm, useColumns } from './Analytics';
import type { ChartType, QueryState, Widget } from '../types';

const CHARTS: ChartType[] = ['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'table', 'kpi'];
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const SPAN = ['', 'lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3'];

export function WidgetView({ w, onChange }: { w: Widget; onChange?: (p: Partial<Widget>) => void }) {
  const r = useAsync(() => api('/analytics/query', { body: cleanQuery(w) }), [JSON.stringify(cleanQuery(w))]);
  return <ChartCard title={w.title} loading={r.loading} error={r.error} onRetry={r.reload} className={SPAN[w.width] ?? ''}><ChartView type={w.type} data={r.data?.data ?? []} label={`${w.agg}(${w.measure ?? '*'})`} onSelect={onChange ? undefined : undefined} /></ChartCard>;
}

export function DashboardsPage() {
  const { can } = useAuth(), nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => api('/dashboards'), []);
  const dup = async (id: string) => { try { await api(`/dashboards/${id}/duplicate`, { method: 'POST', body: {} }); toast('Dashboard duplicated'); reload(); } catch (x: any) { toast(x.message, true); } };
  const del = async (d: any) => { if (!window.confirm(`Delete "${d.name}"?`)) return; try { await api(`/dashboards/${d.id}`, { method: 'DELETE' }); toast('Dashboard deleted'); reload(); } catch (x: any) { toast(x.message, true); } };
  return (<div><PageHeader title="Dashboards" subtitle="Build and reopen your own dashboards." actions={can('ADMIN', 'ANALYST') ? <button className="btn" onClick={() => nav('/dashboards/builder')}><Plus className="h-4 w-4" />New dashboard</button> : undefined} />
    {loading ? <Skeleton h="h-40" /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data.items.length ? <Card><EmptyState title="No dashboards yet" hint="Create one here, or save a chart from the Analytics Explorer." /></Card> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((d: any) => <Card key={d.id}><Link to={`/dashboards/${d.id}`} className="text-base font-semibold text-brand-600 hover:underline">{d.name}</Link><p className="mt-1 line-clamp-2 text-sm text-slate-500">{d.description || 'No description'}</p>
        <p className="mt-2 text-xs text-slate-400">{(d.widgets as any[]).length} widgets · updated {new Date(d.updatedAt).toLocaleDateString()}</p>
        {can('ADMIN', 'ANALYST') && <div className="mt-3 flex gap-2"><button className="btn-ghost" onClick={() => dup(d.id)}><Copy className="h-4 w-4" />Duplicate</button><button className="btn-ghost text-red-600" onClick={() => del(d)}><Trash2 className="h-4 w-4" />Delete</button></div>}</Card>)}</div>}</div>);
}

export function DashboardPage() {
  const { id } = useParams(), nav = useNavigate(), { can } = useAuth(), canEdit = can('ADMIN', 'ANALYST');
  const [name, setName] = useState('Untitled dashboard'), [desc, setDesc] = useState(''), [widgets, setWidgets] = useState<Widget[]>([]), [edit, setEdit] = useState(!id), [busy, setBusy] = useState(false);
  const [q, setQ] = useState<QueryState>(emptyQuery()), [type, setType] = useState<ChartType>('bar'), [title, setTitle] = useState(''), [width, setWidth] = useState(1);
  const load = useAsync(async () => { if (!id) return null; const r = await api(`/dashboards/${id}`); setName(r.dashboard.name); setDesc(r.dashboard.description ?? ''); setWidgets(r.dashboard.widgets); return r.dashboard; }, [id]);
  const { columns } = useColumns(q.datasetId);
  const patch = (i: number, p: Partial<Widget>) => setWidgets(ws => ws.map((w, j) => (j === i ? { ...w, ...p } : w)));
  const move = (i: number, d: number) => setWidgets(ws => { const j = i + d; if (j < 0 || j >= ws.length) return ws; const c = [...ws]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const add = () => setWidgets(ws => [...ws, { ...(cleanQuery(q) as any), id: newId(), title: title || `${q.agg}(${q.measure ?? '*'})${q.dimension ? ' by ' + q.dimension : ''}`, type, width, agg: q.agg === 'COUNT_DISTINCT' ? 'COUNT' : q.agg }]);
  const save = async () => {
    if (!name.trim()) return toast('Give the dashboard a name', true);
    setBusy(true);
    try { const body = { name, description: desc || null, widgets }; if (id) { await api(`/dashboards/${id}`, { method: 'PUT', body }); toast('Dashboard saved'); setEdit(false); } else { const r = await api('/dashboards', { body }); toast('Dashboard created'); nav(`/dashboards/${r.dashboard.id}`, { replace: true }); } }
    catch (x: any) { toast(x.message, true); } setBusy(false);
  };
  const del = async () => { if (!window.confirm('Delete this dashboard?')) return; try { await api(`/dashboards/${id}`, { method: 'DELETE' }); nav('/dashboards'); } catch (x: any) { toast(x.message, true); } };
  const dup = async () => { try { const r = await api(`/dashboards/${id}/duplicate`, { method: 'POST', body: {} }); toast('Duplicated'); nav(`/dashboards/${r.dashboard.id}`); } catch (x: any) { toast(x.message, true); } };
  if (id && load.loading) return <Skeleton h="h-64" />;
  if (id && load.error) return <ErrorBox message={load.error} onRetry={load.reload} />;
  return (<div><PageHeader title={edit ? (id ? 'Edit dashboard' : 'Dashboard builder') : name} subtitle={edit ? undefined : desc} actions={<>
    {canEdit && !edit && <><button className="btn-ghost" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button><button className="btn-ghost" onClick={dup}><Copy className="h-4 w-4" />Duplicate</button><button className="btn-ghost text-red-600" onClick={del}><Trash2 className="h-4 w-4" />Delete</button></>}
    {edit && <><button className="btn" onClick={save} disabled={busy}><Save className="h-4 w-4" />{busy ? 'Saving…' : 'Save dashboard'}</button>{id && <button className="btn-ghost" onClick={() => { setEdit(false); load.reload(); }}>Cancel</button>}</>}</>} />
    {edit && <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="dname">Name</label><input id="dname" className="input" value={name} onChange={e => setName(e.target.value)} /></div><div><label className="label" htmlFor="ddesc">Description</label><input id="ddesc" className="input" value={desc} onChange={e => setDesc(e.target.value)} /></div></div>
      <details className="mt-4" open={!widgets.length}><summary className="cursor-pointer text-sm font-semibold text-brand-600">Add a widget</summary><div className="mt-3"><QueryForm q={q} setQ={setQ} />
        <div className="mt-3 flex flex-wrap items-end gap-3"><div><label className="label">Title</label><input className="input w-56" value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional" /></div>
          <div><label className="label">Chart type</label><select className="input w-32" aria-label="Chart type" value={type} onChange={e => setType(e.target.value as ChartType)}>{CHARTS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Width</label><select className="input w-28" aria-label="Width" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={1}>1 column</option><option value={2}>2 columns</option><option value={3}>3 columns</option></select></div>
          <button className="btn" onClick={add} disabled={!!compat(q, columns)}><Plus className="h-4 w-4" />Add widget</button></div></div></details></Card>}
    {!widgets.length ? <Card><EmptyState title="No widgets yet" hint={edit ? 'Use "Add a widget" above.' : 'Edit this dashboard to add widgets.'} /></Card> :
      <div className="grid gap-4 lg:grid-cols-3">{widgets.map((w, i) => <div key={w.id} className={SPAN[w.width]}>
        {edit && <div className="mb-1 flex flex-wrap items-center gap-1 rounded-t-md bg-slate-100 px-2 py-1 text-xs"><button aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button><button aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
          <input className="input h-7 w-40 py-0" aria-label="Widget title" value={w.title} onChange={e => patch(i, { title: e.target.value })} /><select className="input h-7 w-24 py-0" aria-label="Widget type" value={w.type} onChange={e => patch(i, { type: e.target.value as ChartType })}>{CHARTS.map(c => <option key={c}>{c}</option>)}</select>
          <select className="input h-7 w-16 py-0" aria-label="Widget width" value={w.width} onChange={e => patch(i, { width: Number(e.target.value) })}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
          <button className="ml-auto text-red-600" aria-label="Remove widget" onClick={() => setWidgets(ws => ws.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>}
        <WidgetView w={{ ...w, width: 1 }} /></div>)}</div>}</div>);
}
