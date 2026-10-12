import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Trash2, Upload } from 'lucide-react';
import { api, download } from '../api';
import { useAuth } from '../auth';
import { Card, DataTable, EmptyState, ErrorBox, num, PageHeader, Pager, Skeleton, toast, useAsync } from '../ui';

const statusCls = (s: string) => (s === 'READY' ? 'bg-emerald-100 text-emerald-800' : s === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800');
export const StatusBadge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCls(s)}`}>{s}</span>;
const bytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DatasetsPage() {
  const { can } = useAuth(), [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? ''), [source, setSource] = useState(''), [status, setStatus] = useState(''), [sort, setSort] = useState('createdAt'), [dir, setDir] = useState<'asc' | 'desc'>('desc'), [page, setPage] = useState(1);
  useEffect(() => { setQ(sp.get('q') ?? ''); setPage(1); }, [sp]);
  const { data, loading, error, reload } = useAsync(() => api(`/datasets?${new URLSearchParams({ q, source, status, sort, dir, page: String(page) })}`), [q, source, status, sort, dir, page]);
  const del = async (d: any) => { if (!window.confirm(`Delete "${d.name}" and all its rows? Dashboards and KPIs using it will stop working.`)) return; try { await api(`/datasets/${d.id}`, { method: 'DELETE' }); toast('Dataset deleted'); reload(); } catch (x: any) { toast(x.message, true); } };
  const demo = async () => { try { await api('/datasets/demo', { method: 'POST', body: {} }); toast('Demo data loaded'); reload(); } catch (x: any) { toast(x.message, true); } };
  return (<div><PageHeader title="Datasets" subtitle="Everything you have imported." actions={can('ADMIN', 'ANALYST') ? <><button className="btn-ghost" onClick={demo}>Load demo data</button><Link className="btn" to="/data-sources"><Upload className="h-4 w-4" />Import data</Link></> : undefined} />
    <Card><div className="mb-3 flex flex-wrap gap-2">
      <input className="input w-56" placeholder="Search by name" aria-label="Search datasets" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
      <select className="input w-36" aria-label="Source" value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">All sources</option><option value="file">File</option><option value="demo">Demo</option></select>
      <select className="input w-36" aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option>READY</option><option>FAILED</option><option>IMPORTING</option></select>
      <select className="input w-40" aria-label="Sort" value={`${sort}:${dir}`} onChange={e => { const [s, d] = e.target.value.split(':'); setSort(s); setDir(d as 'asc' | 'desc'); }}><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="name:asc">Name A–Z</option><option value="rowCount:desc">Most rows</option></select></div>
      {loading ? <Skeleton /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data.items.length ? <EmptyState title={q || source || status ? 'No datasets match your search' : 'No datasets yet'} hint="Import a file or load the sample dataset." /> : <>
        <DataTable rows={data.items} cols={[
          { key: 'name', header: 'Name', render: (d: any) => <Link className="font-medium text-brand-600 hover:underline" to={`/datasets/${d.id}`}>{d.name}{d.isDemo && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">demo</span>}</Link> },
          { key: 'filename', header: 'File' }, { key: 'rowCount', header: 'Rows', align: 'right', render: (d: any) => num(d.rowCount) }, { key: 'cols', header: 'Columns', align: 'right', render: (d: any) => d._count?.columns },
          { key: 'source', header: 'Source' }, { key: 'createdAt', header: 'Imported', render: (d: any) => new Date(d.createdAt).toLocaleDateString() }, { key: 'updatedAt', header: 'Updated', render: (d: any) => new Date(d.updatedAt).toLocaleDateString() },
          { key: 'status', header: 'Status', render: (d: any) => <StatusBadge s={d.status} /> }, { key: 'owner', header: 'Owner', render: (d: any) => d.owner?.name },
          { key: 'a', header: '', render: (d: any) => can('ADMIN', 'ANALYST') && <button aria-label={`Delete ${d.name}`} className="text-slate-400 hover:text-red-600" onClick={() => del(d)}><Trash2 className="h-4 w-4" /></button> }]} />
        <Pager page={data.page} pages={data.pages} onPage={setPage} /></>}</Card></div>);
}

export function DatasetDetail() {
  const { id } = useParams(), nav = useNavigate(), { can } = useAuth();
  const [page, setPage] = useState(1), [sort, setSort] = useState<string>(), [dir, setDir] = useState<'asc' | 'desc'>('asc'), [search, setSearch] = useState('');
  const info = useAsync(() => api(`/datasets/${id}`), [id]);
  const rows = useAsync(() => api(`/datasets/${id}/preview?${new URLSearchParams({ page: String(page), dir, ...(sort ? { sort } : {}), ...(search ? { search } : {}) })}`), [id, page, sort, dir, search]);
  if (info.loading) return <Skeleton h="h-64" />;
  if (info.error) return <ErrorBox message={info.error} onRetry={info.reload} />;
  const { dataset: ds, columns, usedBy } = info.data;
  const rename = async () => { const name = window.prompt('Dataset name', ds.name); if (!name?.trim()) return; try { await api(`/datasets/${id}`, { method: 'PATCH', body: { name } }); info.reload(); } catch (x: any) { toast(x.message, true); } };
  const del = async () => { if (!window.confirm('Delete this dataset and all its rows?')) return; try { await api(`/datasets/${id}`, { method: 'DELETE' }); nav('/datasets'); } catch (x: any) { toast(x.message, true); } };
  const exp = (f: string) => download(`/datasets/${id}/export?format=${f}`, null, `${ds.name}.${f}`).catch((x: any) => toast(x.message, true));
  return (<div><PageHeader title={ds.name} subtitle={`${ds.filename} · ${num(ds.rowCount)} rows · imported ${new Date(ds.createdAt).toLocaleDateString()}`} actions={<>
    <button className="btn-ghost" onClick={() => exp('csv')}><Download className="h-4 w-4" />CSV</button><button className="btn-ghost" onClick={() => exp('xlsx')}><Download className="h-4 w-4" />XLSX</button>
    {can('ADMIN', 'ANALYST') && <><button className="btn-ghost" onClick={rename}>Rename</button><button className="btn-ghost text-red-600" onClick={del}>Delete</button></>}</>} />
    <div className="grid gap-4 lg:grid-cols-3"><Card title="Column metadata" className="lg:col-span-2"><DataTable rows={columns} cols={[{ key: 'name', header: 'Column' }, { key: 'type', header: 'Type' }, { key: 'role', header: 'Mapped as', render: (c: any) => Object.entries(ds.mapping).filter(([, v]) => v === c.name).map(([k]) => k).join(', ') || '—' }]} /></Card>
      <Card title="Used by dashboards">{usedBy.length ? <ul className="space-y-1 text-sm">{usedBy.map((d: any) => <li key={d.id}><Link className="text-brand-600 hover:underline" to={`/dashboards/${d.id}`}>{d.name}</Link></li>)}</ul> : <p className="text-sm text-slate-500">Not used in any dashboard yet.</p>}<p className="mt-3 text-xs text-slate-500">Status: <StatusBadge s={ds.status} /></p></Card></div>
    <Card title="Records" className="mt-4" actions={<input className="input w-48" placeholder="Search rows" aria-label="Search rows" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />}>
      {rows.loading ? <Skeleton /> : rows.error ? <ErrorBox message={rows.error} onRetry={rows.reload} /> : <><DataTable rows={rows.data.rows} sort={sort} dir={dir} empty="No matching rows" onSort={k => { dir === 'asc' && sort === k ? setDir('desc') : setDir('asc'); setSort(k); setPage(1); }}
        cols={columns.map((c: any) => ({ key: c.name, header: c.name, sortable: true, align: c.type === 'number' ? ('right' as const) : undefined, render: (r: any) => (r[c.name] === null || r[c.name] === undefined ? '' : c.type === 'number' ? num(r[c.name], 2) : String(r[c.name])) }))} />
        <Pager page={rows.data.page} pages={rows.data.pages} onPage={setPage} /></>}</Card></div>);
}

const ROLES: [string, string, string | null][] = [['date', 'Date', 'date'], ['revenue', 'Revenue', 'number'], ['cost', 'Cost', 'number'], ['profit', 'Profit', 'number'], ['quantity', 'Quantity', 'number'], ['orderId', 'Order ID', null], ['product', 'Product', null], ['category', 'Category', null], ['region', 'Region', null], ['channel', 'Sales channel', null], ['customer', 'Customer ID', null], ['segment', 'Customer segment', null]];
const STEPS = ['Upload', 'Preview', 'Map & validate', 'Confirm', 'Results'];
export function DataSourcesPage() {
  const { can } = useAuth();
  const [step, setStep] = useState(1), [file, setFile] = useState<File | null>(null), [pv, setPv] = useState<any>(null), [cols, setCols] = useState<{ source: string; name: string; type: string }[]>([]), [map, setMap] = useState<Record<string, string>>({}), [name, setName] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [res, setRes] = useState<any>(null);
  const history = useAsync(() => api('/datasets?limit=10&sort=createdAt&dir=desc'), [res]);
  const pick = (f: File | null) => { setErr(''); if (f && f.size > 10 * 1048576) { setErr('File is too large (max 10 MB).'); return; } if (f && !/\.(csv|xlsx|json)$/i.test(f.name)) { setErr('Only .csv, .xlsx and .json files are supported.'); return; } setFile(f); };
  const preview = async () => { if (!file) return; setBusy(true); setErr(''); try { const fd = new FormData(); fd.append('file', file); const p = await api('/datasets/preview', { form: fd }); setPv(p); setCols(p.columns.map((c: any) => ({ source: c.name, name: c.name, type: c.type }))); setMap(p.mapping); setName(file.name.replace(/\.[^.]+$/, '')); setStep(2); } catch (x: any) { setErr(x.message); } setBusy(false); };
  const doImport = async () => { if (!file) return; setBusy(true); setErr('');
    try { const nameOf = (s: string) => cols.find(c => c.source === s)?.name; const mapping = Object.fromEntries(Object.entries(map).filter(([, s]) => s && nameOf(s)).map(([r, s]) => [r, nameOf(s)!]));
      const fd = new FormData(); fd.append('file', file); fd.append('config', JSON.stringify({ name, columns: cols, mapping })); setRes(await api('/datasets/import', { form: fd })); setStep(5); } catch (x: any) { setErr(x.message); } setBusy(false); };
  const reset = () => { setStep(1); setFile(null); setPv(null); setRes(null); setErr(''); };
  if (!can('ADMIN', 'ANALYST')) return <div><PageHeader title="Data Sources" /><Card><EmptyState title="Viewers cannot import data" hint="Ask an administrator for the Analyst role." /></Card></div>;
  return (<div><PageHeader title="Data Sources" subtitle="Import business data and review import history." />
    <Card className="mb-4"><ol className="mb-4 flex flex-wrap gap-2 text-xs">{STEPS.map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}. {s}</li>)}</ol>
      {err && <div className="mb-3"><ErrorBox message={err} /></div>}
      {step === 1 && <div><label className="label" htmlFor="file">Choose a CSV, XLSX or JSON file (max 10 MB)</label><input id="file" type="file" accept=".csv,.xlsx,.json" className="input" onChange={e => pick(e.target.files?.[0] ?? null)} />{file && <p className="mt-2 text-sm text-slate-600">{file.name} · {bytes(file.size)}</p>}<button className="btn mt-3" disabled={!file || busy} onClick={preview}>{busy ? 'Reading file…' : 'Upload & preview'}</button></div>}
      {step === 2 && pv && <div><div className="mb-3 grid gap-3 sm:grid-cols-4 text-sm"><div><b>File</b><br />{pv.fileName}</div><div><b>Size</b><br />{bytes(pv.fileSize)}</div><div><b>Rows</b><br />{num(pv.rowCount)}</div><div><b>Columns</b><br />{pv.columnCount}</div></div>
        {pv.warnings.length > 0 && <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>Validation warnings</b><ul className="list-disc pl-4">{pv.warnings.slice(0, 8).map((w: string) => <li key={w}>{w}</li>)}</ul></div>}
        <p className="mb-1 text-xs text-slate-500">First 20 rows</p><div className="max-h-72 overflow-auto"><DataTable rows={pv.rows} cols={pv.columns.map((c: any) => ({ key: c.name, header: c.name, render: (r: any) => String(r[c.name] ?? '') }))} /></div>
        <div className="mt-3 flex gap-2"><button className="btn-ghost" onClick={() => setStep(1)}>Back</button><button className="btn" onClick={() => setStep(3)}>Next</button></div></div>}
      {step === 3 && <div><p className="mb-2 text-sm font-medium">Columns</p><div className="mb-4 overflow-x-auto"><table className="w-full"><thead><tr><th className="th">In file</th><th className="th">Name</th><th className="th">Type</th></tr></thead><tbody>{cols.map((c, i) => <tr key={c.source} className="border-b border-slate-100"><td className="td">{c.source}</td>
        <td className="td"><input className="input" aria-label={`Name for ${c.source}`} value={c.name} onChange={e => setCols(cols.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
        <td className="td"><select className="input w-32" aria-label={`Type of ${c.source}`} value={c.type} onChange={e => setCols(cols.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}><option>number</option><option>date</option><option>string</option></select></td></tr>)}</tbody></table></div>
        <p className="mb-2 text-sm font-medium">Map to business fields <span className="font-normal text-slate-500">(date and revenue are needed for the overview)</span></p>
        <div className="grid gap-3 sm:grid-cols-3">{ROLES.map(([r, l, t]) => <div key={r}><label className="label">{l}</label><select className="input" aria-label={`Map ${l}`} value={map[r] ?? ''} onChange={e => setMap({ ...map, [r]: e.target.value })}><option value="">— not mapped —</option>{cols.filter(c => !t || c.type === t).map(c => <option key={c.source} value={c.source}>{c.name}</option>)}</select></div>)}</div>
        <div className="mt-4 flex gap-2"><button className="btn-ghost" onClick={() => setStep(2)}>Back</button><button className="btn" onClick={() => setStep(4)} disabled={new Set(cols.map(c => c.name.trim().toLowerCase())).size !== cols.length || cols.some(c => !c.name.trim())}>Next</button></div>
        {new Set(cols.map(c => c.name.trim().toLowerCase())).size !== cols.length && <p className="mt-2 text-xs text-red-600">Column names must be unique.</p>}</div>}
      {step === 4 && <div><label className="label" htmlFor="dn">Dataset name</label><input id="dn" className="input max-w-md" value={name} onChange={e => setName(e.target.value)} /><p className="mt-3 text-sm text-slate-600">{num(pv?.rowCount)} rows and {cols.length} columns will be imported. Values that don't match a column's type are left empty and reported afterwards.</p>
        {busy && <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded bg-slate-100" role="progressbar" aria-label="Importing"><div className="h-full w-1/2 animate-pulse bg-brand-600" /></div>}
        <div className="mt-3 flex gap-2"><button className="btn-ghost" disabled={busy} onClick={() => setStep(3)}>Back</button><button className="btn" disabled={busy || !name.trim()} onClick={doImport}>{busy ? 'Importing…' : 'Import dataset'}</button></div></div>}
      {step === 5 && res && <div><p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-5 w-5" />Import complete</p><p className="mt-2 text-sm">{num(res.imported)} rows imported · {num(res.skipped)} empty rows skipped.</p>
        {res.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{res.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
        <div className="mt-3 flex gap-2"><Link className="btn" to={`/datasets/${res.dataset.id}`}>Open dataset</Link><Link className="btn-ghost" to="/dashboard">View overview</Link><button className="btn-ghost" onClick={reset}>Import another</button></div></div>}</Card>
    <div className="grid gap-4 lg:grid-cols-3"><Card title="Import history" className="lg:col-span-2">{history.loading ? <Skeleton h="h-24" /> : history.error ? <ErrorBox message={history.error} onRetry={history.reload} /> :
      <DataTable rows={history.data.items} empty="No imports yet" cols={[{ key: 'createdAt', header: 'Date', render: (d: any) => new Date(d.createdAt).toLocaleString() }, { key: 'name', header: 'Dataset', render: (d: any) => <Link className="text-brand-600 hover:underline" to={`/datasets/${d.id}`}>{d.name}</Link> }, { key: 'rowCount', header: 'Rows', align: 'right', render: (d: any) => num(d.rowCount) }, { key: 'owner', header: 'By', render: (d: any) => d.owner?.name }, { key: 'status', header: 'Status', render: (d: any) => <StatusBadge s={d.status} /> }]} />}</Card>
      <Card title="Connectors"><ul className="space-y-2 text-sm">{[['CSV files', true], ['Excel (.xlsx)', true], ['JSON files', true], ['PostgreSQL database', false], ['REST API', false], ['Google Sheets', false]].map(([n, on]) => <li key={String(n)} className="flex items-center justify-between"><span>{n}</span><span className={`rounded-full px-2 py-0.5 text-xs ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{on ? 'Available' : 'Planned'}</span></li>)}</ul></Card></div></div>);
}
