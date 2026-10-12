import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Inbox } from 'lucide-react';
import type { ChartType, Point } from './types';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);
export const PALETTE = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#22c55e', '#ec4899', '#a16207'];
export const num = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: d }));
export const inr = (v: number | null | undefined) => (v === null || v === undefined ? '—' : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const run = useCallback(() => { set(s => ({ ...s, loading: true, error: null })); fn().then(data => set({ data, loading: false, error: null })).catch(e => set({ data: null, loading: false, error: e.message || 'Something went wrong' })); }, deps); // eslint-disable-line
  useEffect(run, [run]);
  return { ...state, reload: run };
}
export const Skeleton = ({ h = 'h-40' }: { h?: string }) => <div className={`animate-pulse rounded bg-slate-100 ${h}`} role="status" aria-label="Loading" />;
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"><Inbox className="h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-700">{title}</p>{hint && <p className="max-w-sm text-xs text-slate-500">{hint}</p>}{action}</div>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{message}</span>{onRetry && <button className="font-medium underline" onClick={onRetry}>Retry</button>}</div>;
}
export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card p-4 ${className}`}>{(title || actions) && <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{title}</h3>{actions}</div>}{children}</section>;
}
export function KpiCard({ label, value, change, hint, showChange = true }: { label: string; value: string; change?: number | null; hint?: string; showChange?: boolean }) {
  const up = (change ?? 0) >= 0;
  return (<div className="card p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    <p className="mt-1 flex items-center gap-1 text-xs">{showChange && change !== null && change !== undefined ? <span className={`flex items-center font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>{up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(change).toFixed(1)}%</span> : <span className="text-slate-400">{showChange ? 'No comparison' : ''}</span>}{hint && <span className="text-slate-500">{hint}</span>}</p></div>);
}
export function ChartView({ type, data, label = 'Value', previous, onSelect, height = 260, money = false }: { type: ChartType; data: Point[]; label?: string; previous?: number[]; onSelect?: (label: string) => void; height?: number; money?: boolean }) {
  if (!data.length) return <EmptyState title="No data for this selection" hint="Try a wider date range or remove a filter." />;
  const fmt = (v: number) => (money ? inr(v) : num(v, 2));
  const labels = data.map(d => d.label), values = data.map(d => d.value);
  const click = onSelect ? { onClick: (_e: unknown, els: { index: number }[]) => els[0] && onSelect(labels[els[0].index]) } : {};
  const common = { maintainAspectRatio: false, ...click, plugins: { legend: { display: !!previous || type === 'pie' || type === 'doughnut', position: 'bottom' as const }, tooltip: { callbacks: { label: (c: any) => `${c.dataset.label ?? c.label}: ${fmt(c.parsed.y ?? c.parsed.r ?? c.parsed)}` } } } };
  const axes = { scales: { y: { beginAtZero: true, ticks: { callback: (v: any) => num(Number(v)) } }, x: { ticks: { maxRotation: 45, autoSkip: true } } } };
  let body: ReactNode;
  if (type === 'table') body = <div className="max-h-64 overflow-auto"><table className="w-full"><tbody>{data.map(d => <tr key={d.label} className="border-b border-slate-100"><td className="td">{d.label}</td><td className="td text-right font-medium">{fmt(d.value)}</td></tr>)}</tbody></table></div>;
  else if (type === 'kpi') body = <p className="py-6 text-center text-4xl font-semibold text-ink">{fmt(values.length === 1 ? values[0] : values.reduce((a, b) => a + b, 0))}</p>;
  else if (type === 'pie' || type === 'doughnut') { const C = type === 'pie' ? Pie : Doughnut; body = <C data={{ labels, datasets: [{ data: values, backgroundColor: PALETTE }] }} options={common as any} />; }
  else if (type === 'line' || type === 'area') body = <Line data={{ labels, datasets: [{ label, data: values, borderColor: PALETTE[0], backgroundColor: 'rgba(37,99,235,.12)', fill: type === 'area', tension: 0.3, pointRadius: 2 }, ...(previous ? [{ label: 'Previous period', data: previous, borderColor: '#94a3b8', borderDash: [5, 4], pointRadius: 0, tension: 0.3 }] : [])] }} options={{ ...common, ...axes } as any} />;
  else body = <Bar data={{ labels, datasets: [{ label, data: values, backgroundColor: PALETTE[0], borderRadius: 3 }] }} options={{ ...common, ...axes, ...(type === 'hbar' ? { indexAxis: 'y' as const } : {}) } as any} />;
  return type === 'table' || type === 'kpi' ? <>{body}</> : <div style={{ height }} role="img" aria-label={`${type} chart of ${label}`}>{body}</div>;
}
export function ChartCard(p: { title: string; loading?: boolean; error?: string | null; onRetry?: () => void; children: ReactNode; actions?: ReactNode; className?: string }) {
  return <Card title={p.title} actions={p.actions} className={p.className}>{p.loading ? <Skeleton h="h-60" /> : p.error ? <ErrorBox message={p.error} onRetry={p.onRetry} /> : p.children}</Card>;
}
export type Col<T> = { key: string; header: string; render?: (r: T) => ReactNode; sortable?: boolean; align?: 'right' };
export function DataTable<T>({ cols, rows, sort, dir, onSort, empty = 'No records' }: { cols: Col<T>[]; rows: T[]; sort?: string; dir?: 'asc' | 'desc'; onSort?: (k: string) => void; empty?: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (<div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead className="border-b border-slate-200 bg-slate-50"><tr>{cols.map(c => <th key={c.key} scope="col" className={`th ${c.align === 'right' ? 'text-right' : ''} ${c.sortable ? 'cursor-pointer select-none' : ''}`} onClick={() => c.sortable && onSort?.(c.key)}>{c.header}{sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">{cols.map(c => <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '')}</td>)}</tr>)}</tbody></table></div>);
}
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return <div className="mt-3 flex items-center justify-end gap-2 text-sm"><button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>;
}
let toastTimer: number | undefined;
export function toast(msg: string, bad = false) {
  document.getElementById('iq-toast')?.remove();
  const d = document.createElement('div'); d.id = 'iq-toast'; d.setAttribute('role', 'status'); d.textContent = msg;
  d.className = `fixed bottom-5 right-5 z-50 rounded-md px-4 py-2 text-sm text-white shadow-lg ${bad ? 'bg-red-600' : 'bg-slate-800'}`; document.body.appendChild(d);
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => d.remove(), 3500);
}
export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) =>
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold text-ink">{title}</h1>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div><div className="flex flex-wrap items-center gap-2">{actions}</div></div>;
