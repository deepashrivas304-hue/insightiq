import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { auth, HttpError, requireRole, wrap } from '../middleware';
import { audit, getDataset, ownerFilter } from '../lib/access';
import { Agg, colSql, loadCols, Mapping, QuerySchema, runQuery } from '../lib/query';
import { kpiStatus } from '../lib/metrics';
const r = Router();
r.use(auth);
const Body = z.object({ name: z.string().trim().min(1).max(100), datasetId: z.string(), measure: z.string(), aggregation: Agg.default('SUM'), target: z.number().positive(), warningPct: z.number().min(1).max(100).default(80), period: z.enum(['month', 'quarter', 'year', 'all']).default('month') });
type K = { id: string; name: string; datasetId: string; measure: string; aggregation: string; target: number; warningPct: number; period: string };
async function evaluate(k: K) {
  const ds = await prisma.dataset.findUniqueOrThrow({ where: { id: k.datasetId } }), cols = await loadCols(k.datasetId), dateField = (ds.mapping as Mapping).date;
  let from: string | undefined, to: string | undefined;
  if (dateField && k.period !== 'all') {
    const [mx] = await prisma.$queryRaw<{ m: Date | null }[]>(Prisma.sql`SELECT MAX(${colSql(dateField, 'date')}) AS m FROM "DatasetRow" WHERE "datasetId" = ${k.datasetId}`);
    if (mx?.m) { // periods end at the latest date in the data
      const y = mx.m.getUTCFullYear(), m = mx.m.getUTCMonth(), sm = k.period === 'month' ? m : k.period === 'quarter' ? Math.floor(m / 3) * 3 : 0;
      from = new Date(Date.UTC(y, sm, 1)).toISOString().slice(0, 10); to = mx.m.toISOString().slice(0, 10);
    }
  }
  const agg = k.aggregation as z.infer<typeof Agg>, common = { datasetId: k.datasetId, measure: k.measure, agg, dateField, from, to };
  const current = (await runQuery(QuerySchema.parse(common), cols))[0]?.value ?? 0;
  const trend = dateField ? await runQuery(QuerySchema.parse({ ...common, from: undefined, to: undefined, dimension: dateField, bucket: 'month' }), cols) : [];
  const achievement = (current / k.target) * 100;
  return { ...k, current, achievement, status: kpiStatus(achievement, k.warningPct), trend, from: from ?? null, to: to ?? null };
}
async function validate(u: Express.Request['user'], b: z.infer<typeof Body>) {
  await getDataset(u!, b.datasetId); const cols = await loadCols(b.datasetId), t = cols.get(b.measure);
  if (!t) throw new HttpError(400, `Unknown field "${b.measure}"`);
  if (t !== 'number' && b.aggregation !== 'COUNT' && b.aggregation !== 'COUNT_DISTINCT') throw new HttpError(400, `${b.aggregation} needs a numeric field`);
}
r.get('/', wrap(async (req, res) => { const ks = await prisma.kpi.findMany({ where: ownerFilter(req.user!), orderBy: { createdAt: 'asc' } }); res.json({ items: await Promise.all(ks.map(evaluate)) }); }));
r.post('/', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const b = Body.parse(req.body); await validate(req.user, b);
  const k = await prisma.kpi.create({ data: { ...b, ownerId: req.user!.id } }); await audit(req.user!.id, 'kpi.create', 'kpi', k.id, k.name); res.status(201).json({ kpi: await evaluate(k) });
}));
r.put('/:id', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const cur = await prisma.kpi.findFirst({ where: { id: req.params.id, ...ownerFilter(req.user!) } }); if (!cur) throw new HttpError(404, 'KPI not found');
  const b = Body.parse(req.body); await validate(req.user, b);
  res.json({ kpi: await evaluate(await prisma.kpi.update({ where: { id: cur.id }, data: b })) });
}));
r.delete('/:id', requireRole('ADMIN', 'ANALYST'), wrap(async (req, res) => {
  const cur = await prisma.kpi.findFirst({ where: { id: req.params.id, ...ownerFilter(req.user!) } }); if (!cur) throw new HttpError(404, 'KPI not found');
  await prisma.kpi.delete({ where: { id: cur.id } }); res.json({ ok: true });
}));
export default r;
