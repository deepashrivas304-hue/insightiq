import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { auth, HttpError, requireRole, wrap } from '../middleware';
import { audit } from '../lib/access';
const r = Router();
r.use(auth);
r.get('/activity', wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), where = req.user!.role === 'ADMIN' ? {} : { userId: req.user!.id };
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { user: { select: { name: true } } } }), prisma.auditLog.count({ where })]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / 25)) });
}));
r.get('/admin/users', requireRole('ADMIN'), wrap(async (_req, res) => res.json({ items: await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, role: true, createdAt: true } }) })));
r.patch('/admin/users/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = z.object({ role: z.enum(['ADMIN', 'ANALYST', 'VIEWER']) }).parse(req.body);
  if (req.params.id === req.user!.id) throw new HttpError(400, 'You cannot change your own role');
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { role: b.role }, select: { id: true, name: true, email: true, role: true } });
  await audit(req.user!.id, 'user.role', 'user', u.id, b.role); res.json({ user: u });
}));
export default r;
