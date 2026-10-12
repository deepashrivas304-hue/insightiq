import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { auth, HttpError, requireRole, wrap } from '../middleware';
import { audit, getDataset, ownerFilter } from '../lib/access';
import { Filter } from '../lib/query';
const r = Router();
r.use(auth);
const Widget = z.object({ id: z.string().max(40), title: z.string().max(120), type: z.enum(['line', 'bar', 'hbar', 'area', 'pie', 'doughnut', 'table', 'kpi']), width: z.number().int().min(1).max(3).default(1),
  datasetId: z.string(), dimension: z.string().optional(), bucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(), measure: z.string().optional(),
  agg: z.enum(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']).default('SUM'), filters: z.array(Filter).default([]), limit: z.number().int().min(1).max(200).default(20),
  dateField: z.string().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), sort: z.enum(['value_desc', 'value_asc', 'label_asc']).default('label_asc') });
const Body = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional().nullable(), widgets: z.array(Widget).max(30).default([]) });
const own = async (u: Express.Request['user'], id: string) => { const d = await prisma.dashboard.findFirst({ where: { id, ...ownerFilter(u!) } }); if (!d) throw new HttpError(404, 'Dashboard not found'); return d; };
const checkDatasets = async (u: Express.Request['user'], widgets: z.infer<typeof Widget>[]) => { for (const id of new Set(widgets.map(w => w.datasetId))) await getDataset(u!, id); };
r.get('/', wrap(async (req, res) => res.json({ items: await prisma.dashboard.findMany({ where: ownerFilter(req.user!), orderBy: { updatedAt: 'desc' } }) })));
r.get('/:id', wrap(async (req, res) => res.json({ dashboard: await own(req.user, req.params.id) })));
r.post('/', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const b = Body.parse(req.body); await checkDatasets(req.user, b.widgets);
  const d = await prisma.dashboard.create({ data: { name: b.name, description: b.description ?? null, widgets: b.widgets as Prisma.InputJsonValue, ownerId: req.user!.id } });
  await audit(req.user!.id, 'dashboard.create', 'dashboard', d.id, d.name); res.status(201).json({ dashboard: d });
}));
r.put('/:id', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const cur = await own(req.user, req.params.id), b = Body.parse(req.body); await checkDatasets(req.user, b.widgets);
  const d = await prisma.dashboard.update({ where: { id: cur.id }, data: { name: b.name, description: b.description ?? null, widgets: b.widgets as Prisma.InputJsonValue } });
  await audit(req.user!.id, 'dashboard.update', 'dashboard', d.id, d.name); res.json({ dashboard: d });
}));
r.post('/:id/duplicate', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const cur = await own(req.user, req.params.id);
  const d = await prisma.dashboard.create({ data: { name: `${cur.name} (copy)`, description: cur.description, widgets: cur.widgets as Prisma.InputJsonValue, ownerId: req.user!.id } });
  res.status(201).json({ dashboard: d });
}));
r.delete('/:id', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => { const cur = await own(req.user, req.params.id); await prisma.dashboard.delete({ where: { id: cur.id } }); await audit(req.user!.id, 'dashboard.delete', 'dashboard', cur.id, cur.name); res.json({ ok: true }); }));
export default r;
