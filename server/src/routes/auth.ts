import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { audit } from '../lib/access';
import { auth, HttpError, wrap } from '../middleware';
const r = Router();
const token = (id: string) => jwt.sign({ sub: id }, config.AUTH_SECRET, { expiresIn: '7d' });
const pub = (u: { id: string; name: string; email: string; role: string }) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
r.post('/register', wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128) }).parse(req.body);
  const first = (await prisma.user.count()) === 0;
  const u = await prisma.user.create({ data: { name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, 10), role: first ? 'ADMIN' : 'ANALYST' } });
  await audit(u.id, 'register', 'user', u.id);
  res.status(201).json({ token: token(u.id), user: pub(u) });
}));
r.post('/login', wrap(async (req, res) => {
  const b = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  await audit(u.id, 'login', 'user', u.id);
  res.json({ token: token(u.id), user: pub(u) });
}));
r.get('/me', auth, wrap(async (req, res) => { res.json({ user: req.user }); }));
r.patch('/me', auth, wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), currentPassword: z.string().optional(), newPassword: z.string().min(8).max(128).optional() }).parse(req.body);
  const data: { name?: string; passwordHash?: string } = {};
  if (b.name) data.name = b.name;
  if (b.newPassword) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!b.currentPassword || !(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
    data.passwordHash = await bcrypt.hash(b.newPassword, 10);
  }
  const u = await prisma.user.update({ where: { id: req.user!.id }, data });
  await audit(u.id, 'profile.update', 'user', u.id);
  res.json({ user: pub(u) });
}));
export default r;
