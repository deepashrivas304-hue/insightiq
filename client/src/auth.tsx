import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { Role, User } from './types';
type Ctx = { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; register: (n: string, e: string, p: string) => Promise<void>; logout: () => void; can: (...r: Role[]) => boolean };
export const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(!!getToken());
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  useEffect(() => { if (getToken()) api('/auth/me').then(r => setUser(r.user)).catch(() => setToken(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { window.addEventListener('iq-logout', logout); return () => window.removeEventListener('iq-logout', logout); }, [logout]);
  const done = (r: { token: string; user: User }) => { setToken(r.token); setUser(r.user); };
  const value: Ctx = { user, loading, logout, can: (...r) => !!user && r.includes(user.role),
    login: async (email, password) => done(await api('/auth/login', { body: { email, password } })),
    register: async (name, email, password) => done(await api('/auth/register', { body: { name, email, password } })) };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
