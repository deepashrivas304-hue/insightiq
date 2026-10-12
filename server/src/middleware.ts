import { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from './config';
import { prisma } from './db';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export type AuthUser = { id: string; email: string; name: string; role: 'ADMIN' | 'ANALYST' | 'VIEWER' };
declare global { namespace Express { interface Request { user?: AuthUser } } }
export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
export const auth: RequestHandler = async (req, _res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated');
    let id: string;
    try { id = (jwt.verify(h.slice(7), config.AUTH_SECRET) as { sub: string }).sub; } catch { throw new HttpError(401, 'Invalid or expired token'); }
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw new HttpError(401, 'Account not found');
    req.user = { id: u.id, email: u.email, name: u.name, role: u.role };
    next();
  } catch (e) { next(e); }
};
export const requireRole = (...roles: AuthUser['role'][]): RequestHandler => (req, _res, next) =>
  roles.includes(req.user!.role) ? next() : next(new HttpError(403, 'Your role does not allow this action'));
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message });
  if (err?.name === 'ParseError') return res.status(400).json({ error: err.message });
  if (err?.code === 'P2002') return res.status(409).json({ error: 'That value already exists' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
