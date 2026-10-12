import { ReactNode, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Database, FileText, Gauge, LayoutDashboard, LineChart, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, Shield, Table2, X } from 'lucide-react';
import { useAuth } from './auth';
import { Skeleton } from './ui';
import { AuthPage, ActivityPage, AdminPage, SettingsPage } from './pages/Misc';
import Overview from './pages/Overview';
import { DataSourcesPage, DatasetDetail, DatasetsPage } from './pages/Datasets';
import { ExplorerPage, ReportsPage } from './pages/Analytics';
import { DashboardPage, DashboardsPage } from './pages/Dashboards';
import KpiPage from './pages/Kpis';

const NAV = [['/dashboard', 'Overview', LayoutDashboard], ['/dashboards', 'Dashboards', BarChart3], ['/kpis', 'KPI Center', Gauge], ['/data-sources', 'Data Sources', Database], ['/datasets', 'Datasets', Table2],
  ['/reports', 'Reports', FileText], ['/analytics', 'Analytics Explorer', LineChart], ['/activity', 'Activity', Activity], ['/settings', 'Settings', Settings]] as const;

function Shell() {
  const { user, logout } = useAuth(), nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false), [open, setOpen] = useState(false), [q, setQ] = useState(''), [menu, setMenu] = useState(false);
  const links = [...NAV, ...(user?.role === 'ADMIN' ? ([['/admin', 'Admin', Shield]] as const) : [])];
  const list = (
    <nav className="flex-1 space-y-1 px-2 py-3" aria-label="Main">
      {links.map(([to, label, Icon]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} title={label}
        className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Icon className="h-4 w-4 shrink-0" />{!collapsed && label}</NavLink>)}
    </nav>);
  return (
    <div className="flex min-h-screen">
      <aside className={`hidden shrink-0 flex-col bg-slate-900 md:flex ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="flex h-14 items-center justify-between px-4"><span className="text-lg font-semibold text-white">{collapsed ? 'IQ' : <>Insight<span className="text-brand-500">IQ</span></>}</span></div>
        {list}
        <button className="m-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" />Collapse</>}</button>
      </aside>
      {open && <div className="fixed inset-0 z-40 md:hidden"><div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900"><div className="flex h-14 items-center justify-between px-4"><span className="text-lg font-semibold text-white">Insight<span className="text-brand-500">IQ</span></span><button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5 text-slate-300" /></button></div>{list}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 sm:inline">{user?.name}'s workspace</span>
          <form className="relative flex-1 max-w-md" onSubmit={e => { e.preventDefault(); nav(`/datasets?q=${encodeURIComponent(q)}`); }} role="search"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="Search datasets…" aria-label="Search datasets" value={q} onChange={e => setQ(e.target.value)} /></form>
          <div className="relative ml-auto"><button className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm" onClick={() => setMenu(!menu)} aria-haspopup="menu"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{user?.name?.[0]?.toUpperCase()}</span><span className="hidden sm:inline">{user?.name}</span></button>
            {menu && <div className="card absolute right-0 z-30 mt-2 w-48 p-1" role="menu"><p className="px-3 py-1 text-xs text-slate-500">{user?.email} · {user?.role}</p><Link to="/profile" className="block rounded px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setMenu(false)}>Profile</Link><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={logout}><LogOut className="h-4 w-4" />Log out</button></div>}</div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>);
}
function Protected() { const { user, loading } = useAuth(); if (loading) return <div className="p-8"><Skeleton h="h-64" /></div>; return user ? <Shell /> : <Navigate to="/login" replace />; }
export function RequireRole({ roles, children }: { roles: ('ADMIN' | 'ANALYST' | 'VIEWER')[]; children: ReactNode }) { const { can } = useAuth(); return can(...roles) ? <>{children}</> : <div className="card p-8 text-center text-sm text-slate-600">You are not authorized to view this page.</div>; }

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Overview />} />
        <Route path="/dashboards" element={<DashboardsPage />} /><Route path="/dashboards/builder" element={<DashboardPage />} /><Route path="/dashboards/:id" element={<DashboardPage />} />
        <Route path="/kpis" element={<KpiPage />} /><Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/datasets" element={<DatasetsPage />} /><Route path="/datasets/:id" element={<DatasetDetail />} />
        <Route path="/analytics" element={<ExplorerPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/activity" element={<ActivityPage />} />
        <Route path="/profile" element={<SettingsPage />} /><Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<RequireRole roles={['ADMIN']}><AdminPage /></RequireRole>} />
        <Route path="*" element={<div className="card p-8 text-center text-sm">Page not found. <Link className="text-brand-600 underline" to="/dashboard">Go to Overview</Link></div>} />
      </Route>
    </Routes>);
}
