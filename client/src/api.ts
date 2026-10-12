const BASE: string = (import.meta.env.VITE_API_URL as string) || '/api';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const getToken = () => localStorage.getItem('iq_token');
export const setToken = (t: string | null) => (t ? localStorage.setItem('iq_token', t) : localStorage.removeItem('iq_token'));
async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try { res = await fetch(BASE + path, { ...init, headers }); } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and that the API is running.'); }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.issues ? `${j.error}: ${j.issues.join('; ')}` : j.error || msg; } catch { /* ignore */ }
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) { setToken(null); window.dispatchEvent(new Event('iq-logout')); }
    throw new ApiError(res.status, msg);
  }
  return res;
}
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET') };
  if (opts.form) init.body = opts.form; else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers = { 'Content-Type': 'application/json' }; }
  return (await raw(path, init)).json();
}
export async function download(path: string, body: unknown | null, fallbackName: string) {
  const res = await raw(path, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {});
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
