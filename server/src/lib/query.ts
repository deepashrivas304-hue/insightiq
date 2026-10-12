import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from '../middleware';
import { aov, margin } from './metrics';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Agg = z.enum(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT']);
export const Filter = z.object({ field: z.string(), op: z.enum(['eq', 'in', 'gte', 'lte']).default('eq'), value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]) });
export const QuerySchema = z.object({
  datasetId: z.string(), dimension: z.string().optional(), bucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  measure: z.string().optional(), agg: Agg.default('SUM'), filters: z.array(Filter).default([]),
  dateField: z.string().optional(), from: iso.optional(), to: iso.optional(),
  limit: z.number().int().min(1).max(1000).default(100), sort: z.enum(['value_desc', 'value_asc', 'label_asc']).default('label_asc'),
});
export type Query = z.infer<typeof QuerySchema>;
export type Cols = Map<string, string>;
export type Point = { label: string; value: number };

export async function loadCols(datasetId: string): Promise<Cols> {
  const cols = await prisma.datasetColumn.findMany({ where: { datasetId } });
  return new Map(cols.map(c => [c.name, c.type]));
}
// Field names are always checked against the dataset's column whitelist and passed as bind parameters.
export const colSql = (f: string, t: string) =>
  t === 'number' ? Prisma.sql`("data"->>${f})::numeric` : t === 'date' ? Prisma.sql`("data"->>${f})::date` : Prisma.sql`("data"->>${f})`;
const need = (cols: Cols, f: string) => { const t = cols.get(f); if (!t) throw new HttpError(400, `Unknown field "${f}"`); return t; };
const lit = (t: string, v: string | number) => (t === 'date' ? Prisma.sql`${String(v)}::date` : t === 'number' ? Prisma.sql`${Number(v)}` : Prisma.sql`${String(v)}`);

export function where(datasetId: string, cols: Cols, filters: Query['filters'], dateField?: string, from?: string, to?: string) {
  const p: Prisma.Sql[] = [Prisma.sql`"datasetId" = ${datasetId}`];
  for (const f of filters) {
    const t = need(cols, f.field), c = colSql(f.field, t), vals = Array.isArray(f.value) ? f.value : [f.value];
    if (f.op === 'in') p.push(vals.length ? Prisma.sql`${c} IN (${Prisma.join(vals.map(v => lit(t, v)))})` : Prisma.sql`FALSE`);
    else if (f.op === 'eq') p.push(Prisma.sql`${c} = ${lit(t, vals[0])}`);
    else if (f.op === 'gte') p.push(Prisma.sql`${c} >= ${lit(t, vals[0])}`);
    else p.push(Prisma.sql`${c} <= ${lit(t, vals[0])}`);
  }
  if (dateField && (from || to)) {
    if (need(cols, dateField) !== 'date') throw new HttpError(400, `"${dateField}" is not a date column`);
    const c = colSql(dateField, 'date');
    if (from) p.push(Prisma.sql`${c} >= ${from}::date`);
    if (to) p.push(Prisma.sql`${c} <= ${to}::date`);
  }
  return Prisma.join(p, ' AND ');
}
const FMT: Record<string, string> = { day: 'YYYY-MM-DD', week: 'YYYY-MM-DD', month: 'YYYY-MM', quarter: 'YYYY-"Q"Q', year: 'YYYY' };

export async function runQuery(q: Query, cols: Cols): Promise<Point[]> {
  const w = where(q.datasetId, cols, q.filters, q.dateField, q.from, q.to);
  let value: Prisma.Sql;
  if (q.agg === 'COUNT') value = q.measure ? Prisma.sql`COUNT(${colSql(q.measure, need(cols, q.measure))})` : Prisma.sql`COUNT(*)`;
  else if (q.agg === 'COUNT_DISTINCT') { if (!q.measure) throw new HttpError(400, 'A field is required for distinct counts'); need(cols, q.measure); value = Prisma.sql`COUNT(DISTINCT ${colSql(q.measure, 'string')})`; }
  else {
    if (!q.measure) throw new HttpError(400, `${q.agg} needs a numeric measure`);
    if (need(cols, q.measure) !== 'number') throw new HttpError(400, `${q.agg} needs a numeric field, but "${q.measure}" is not numeric`);
    value = Prisma.sql`${Prisma.raw(q.agg)}(${colSql(q.measure, 'number')})`; // q.agg is a validated enum
  }
  const order = q.sort === 'value_desc' ? Prisma.raw('value DESC NULLS LAST') : q.sort === 'value_asc' ? Prisma.raw('value ASC NULLS LAST') : Prisma.raw('label ASC');
  let rows: { label: string | null; value: number | null }[];
  if (q.dimension) {
    const t = need(cols, q.dimension);
    const label = t === 'date' && q.bucket
      ? Prisma.sql`to_char(date_trunc(${Prisma.raw(`'${q.bucket}'`)}, ${colSql(q.dimension, 'date')}), ${FMT[q.bucket]})`
      : Prisma.sql`${colSql(q.dimension, t)}::text`;
    rows = await prisma.$queryRaw(Prisma.sql`SELECT ${label} AS label, ${value}::float8 AS value FROM "DatasetRow" WHERE ${w} GROUP BY 1 ORDER BY ${order} LIMIT ${q.limit}`);
  } else rows = await prisma.$queryRaw(Prisma.sql`SELECT 'Total' AS label, ${value}::float8 AS value FROM "DatasetRow" WHERE ${w}`);
  return rows.map(r => ({ label: r.label ?? '(empty)', value: Number(r.value ?? 0) }));
}

export type Mapping = Record<string, string>;
export async function totals(base: Partial<Query> & { datasetId: string }, cols: Cols, M: Mapping) {
  const run = (measure: string | undefined, agg: Query['agg']) => runQuery(QuerySchema.parse({ ...base, dimension: undefined, bucket: undefined, measure, agg }), cols).then(r => r[0]?.value ?? 0);
  const [revenue, cost, profitCol, orders] = await Promise.all([
    run(M.revenue, 'SUM'), M.cost ? run(M.cost, 'SUM') : Promise.resolve(0), M.profit ? run(M.profit, 'SUM') : Promise.resolve(null),
    M.orderId ? run(M.orderId, 'COUNT_DISTINCT') : run(undefined, 'COUNT')]);
  const profit = profitCol ?? (M.cost ? revenue - cost : null);
  return { revenue, profit, orders, margin: profit === null ? null : margin(profit, revenue), aov: aov(revenue, orders) };
}
export async function repeatCustomers(datasetId: string, cols: Cols, M: Mapping, filters: Query['filters'], from?: string, to?: string) {
  const w = where(datasetId, cols, filters, M.date, from, to), cust = colSql(M.customer, 'string');
  const ord = M.orderId ? Prisma.sql`COUNT(DISTINCT ${colSql(M.orderId, 'string')})` : Prisma.sql`COUNT(*)`;
  const [r] = await prisma.$queryRaw<{ total: number; repeat: number }[]>(Prisma.sql`SELECT COUNT(*)::float8 AS total, (COUNT(*) FILTER (WHERE n > 1))::float8 AS repeat FROM (SELECT ${cust} AS c, ${ord} AS n FROM "DatasetRow" WHERE ${w} AND ${cust} IS NOT NULL GROUP BY 1) t`);
  return { unique: r?.total ?? 0, repeat: r?.repeat ?? 0 };
}
