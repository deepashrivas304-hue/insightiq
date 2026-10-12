import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, DataTable, EmptyState, ErrorBox, PageHeader, Pager, Skeleton, toast, useAsync } from '../ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth(), nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { mode === 'login' ? await login(f.email, f.password) : await register(f.name, f.email, f.password); nav('/dashboard'); } catch (x: any) { setErr(x.message); } setBusy(false); };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6" aria-label={mode}>
        <h1 className="text-2xl font-semibold text-ink">Insight<span className="text-brand-600">IQ</span></h1><p className="mb-4 text-sm text-slate-500">Turn business data into better decisions.</p>
        {err && <div className="mb-3"><ErrorBox message={err} /></div>}
        {mode === 'register' && <div className="mb-3"><label className="label" htmlFor="name">Name</label><input id="name" className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>}
        <div className="mb-3"><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
        <div className="mb-4"><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />{mode === 'register' && <p className="mt-1 text-xs text-slate-500">At least 8 characters. The first account becomes the administrator.</p>}</div>
        <button className="btn w-full justify-center" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="mt-4 text-center text-sm text-slate-500">{mode === 'login' ? <>New here? <Link className="text-brand-600 underline" to="/register">Create an account</Link></> : <>Have an account? <Link className="text-brand-600 underline" to="/login">Sign in</Link></>}</p>
      </form>
    </div>);
}

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => api(`/activity?page=${page}`), [page]);
  return (<div><PageHeader title="Activity" subtitle="Recent imports, exports and changes." />
    <Card>{loading ? <Skeleton /> : error ? <ErrorBox message={error} onRetry={reload} /> : <>
      <DataTable rows={data.items} empty="No activity yet" cols={[{ key: 'createdAt', header: 'When', render: (r: any) => new Date(r.createdAt).toLocaleString() }, { key: 'user', header: 'User', render: (r: any) => r.user?.name ?? '—' }, { key: 'action', header: 'Action' }, { key: 'detail', header: 'Detail' }]} />
      <Pager page={data.page} pages={data.pages} onPage={setPage} /></>}</Card></div>);
}

export function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? ''), [cur, setCur] = useState(''), [nw, setNw] = useState(''), [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setBusy(true);
    try { await api('/auth/me', { method: 'PATCH', body: { name, ...(nw ? { currentPassword: cur, newPassword: nw } : {}) } }); toast('Profile updated'); setCur(''); setNw(''); } catch (x: any) { toast(x.message, true); } setBusy(false); };
  return (<div className="max-w-xl"><PageHeader title="Settings" subtitle="Your profile and security." />
    <Card><form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="pn">Name</label><input id="pn" className="input" value={name} required onChange={e => setName(e.target.value)} /></div>
      <div><label className="label">Email</label><input className="input bg-slate-50" value={user?.email} disabled /></div>
      <div><label className="label">Role</label><input className="input bg-slate-50" value={user?.role} disabled /></div>
      <hr /><p className="text-sm font-medium">Change password</p>
      <div><label className="label" htmlFor="cp">Current password</label><input id="cp" type="password" className="input" value={cur} onChange={e => setCur(e.target.value)} /></div>
      <div><label className="label" htmlFor="np">New password (min 8 characters)</label><input id="np" type="password" minLength={8} className="input" value={nw} onChange={e => setNw(e.target.value)} /></div>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></Card></div>);
}

export function AdminPage() {
  const { data, loading, error, reload } = useAsync(() => api('/admin/users'), []);
  const { user } = useAuth();
  const change = async (id: string, role: string) => { try { await api(`/admin/users/${id}`, { method: 'PATCH', body: { role } }); toast('Role updated'); reload(); } catch (x: any) { toast(x.message, true); } };
  return (<div><PageHeader title="Administration" subtitle="Manage users and roles." />
    <Card>{loading ? <Skeleton /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data.items.length ? <EmptyState title="No users" /> :
      <DataTable rows={data.items} cols={[{ key: 'name', header: 'Name' }, { key: 'email', header: 'Email' }, { key: 'createdAt', header: 'Joined', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
        { key: 'role', header: 'Role', render: (r: any) => <select aria-label={`Role for ${r.name}`} className="input w-36" value={r.role} disabled={r.id === user?.id} onChange={e => change(r.id, e.target.value)}>{['ADMIN', 'ANALYST', 'VIEWER'].map(x => <option key={x}>{x}</option>)}</select> }]} />}</Card></div>);
}
