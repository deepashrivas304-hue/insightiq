import { Router } from 'express';
import { z } from 'zod';
import { auth, HttpError, wrap } from '../middleware';
import { getDataset } from '../lib/access';
import { Filter, loadCols, Mapping, Point, Query, QuerySchema, repeatCustomers, runQuery, totals } from '../lib/query';
import { pctChange } from '../lib/metrics';
const r = Router();
r.use(auth);
r.post('/query', wrap(async (req, res) => {
  const q = QuerySchema.parse(req.body);
  const ds = await getDataset(req.user!, q.datasetId);
  res.json({ data: await runQuery(q, await loadCols(ds.id)) });
}));
const day = (s: string) => new Date(s + 'T00:00:00Z');
const fmt = (d: Date) => d.toISOString().slice(0, 10);
r.get('/overview', wrap(async (req, res) => {
  const q = z.object({ datasetId: z.string(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), filters: z.string().optional() }).parse(req.query);
  let filters: Query['filters'] = [];
  if (q.filters) { try { filters = z.array(Filter).parse(JSON.parse(q.filters)); } catch { throw new HttpError(400, 'Invalid filters'); } }
  const ds = await getDataset(req.user!, q.datasetId), cols = await loadCols(ds.id), M = ds.mapping as Mapping;
  if (!M.date || !M.revenue) throw new HttpError(400, 'This dataset needs a mapped date column and revenue column. Open it in Datasets to check its mapping.');
  const base = { datasetId: ds.id, filters, dateField: M.date, from: q.from, to: q.to };
  let prevBase: typeof base | null = null, bucket: 'day' | 'month' = 'month';
  if (q.from && q.to) {
    const len = Math.round((day(q.to).getTime() - day(q.from).getTime()) / 864e5) + 1;
    bucket = len <= 62 ? 'day' : 'month';
    const prevTo = new Date(day(q.from).getTime() - 864e5), prevFrom = new Date(prevTo.getTime() - (len - 1) * 864e5);
    prevBase = { ...base, from: fmt(prevFrom), to: fmt(prevTo) };
  }
  const by = (b: typeof base, extra: Partial<Query>) => runQuery(QuerySchema.parse({ ...b, ...extra }), cols);
  const series = async (b: typeof base, measure: string, agg: Query['agg']) => by(b, { dimension: M.date, bucket, measure, agg });
  const dim = (field: string | undefined, extra: Partial<Query> = {}) => (field ? by(base, { dimension: field, measure: M.revenue, agg: 'SUM', sort: 'value_desc', limit: 12, ...extra }) : Promise.resolve(null));
  const profitSeries = async (b: typeof base): Promise<Point[] | null> => {
    if (M.profit) return series(b, M.profit, 'SUM');
    if (!M.cost) return null;
    const [rev, cost] = await Promise.all([series(b, M.revenue, 'SUM'), series(b, M.cost, 'SUM')]);
    const c = new Map(cost.map(p => [p.label, p.value]));
    return rev.map(p => ({ label: p.label, value: p.value - (c.get(p.label) ?? 0) }));
  };
  const [cur, prev, revTrend, prevTrend, ordersTrend, profitTrend, byCategory, byProduct, byRegion, byChannel, customers] = await Promise.all([
    totals(base, cols, M), prevBase ? totals(prevBase, cols, M) : Promise.resolve(null),
    series(base, M.revenue, 'SUM'), prevBase ? series(prevBase, M.revenue, 'SUM') : Promise.resolve([]),
    M.orderId ? series(base, M.orderId, 'COUNT_DISTINCT') : by(base, { dimension: M.date, bucket, agg: 'COUNT' }),
    profitSeries(base), dim(M.category), dim(M.product, { limit: 10 }), dim(M.region), dim(M.channel),
    M.customer ? repeatCustomers(ds.id, cols, M, filters, q.from, q.to) : Promise.resolve(null)]);
  const k = (key: 'revenue' | 'profit' | 'orders' | 'aov' | 'margin') => ({ value: cur[key], previous: prev ? prev[key] : null, change: prev && cur[key] !== null && prev[key] !== null ? pctChange(cur[key] as number, prev[key] as number) : null });
  res.json({ dataset: { id: ds.id, name: ds.name, isDemo: ds.isDemo }, bucket, mapping: M,
    kpis: { revenue: k('revenue'), profit: k('profit'), orders: k('orders'), aov: k('aov'), margin: k('margin'), growth: { value: k('revenue').change } },
    trend: { current: revTrend, previous: prevTrend }, ordersTrend, profitTrend, byCategory, byProduct, byRegion, byChannel, customers });
}));
export default r;
