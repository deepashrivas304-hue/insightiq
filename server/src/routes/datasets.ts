import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { auth, HttpError, requireRole, wrap } from '../middleware';
import { audit, getDataset, insertRows, ownerFilter } from '../lib/access';
import { colSql, loadCols } from '../lib/query';
import { detectType, MAPPING_ROLES, parseFile, sanitizeCell, suggestMapping, toDate, toNumber } from '../lib/parse';
import { createDemoDataset } from '../lib/sampleData';
const r = Router();
r.use(auth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_q, f, cb) => (/\.(csv|xlsx|json)$/i.test(f.originalname) ? cb(null, true) : cb(new HttpError(400, 'Only .csv, .xlsx and .json files are allowed'))) });
const writer = requireRole('ADMIN', 'ANALYST');

r.get('/', wrap(async (req, res) => {
  const q = z.object({ q: z.string().optional(), source: z.string().optional(), status: z.string().optional(), sort: z.enum(['createdAt', 'name', 'rowCount']).default('createdAt'), dir: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const where: Prisma.DatasetWhereInput = { ...ownerFilter(req.user!), ...(q.source ? { source: q.source } : {}), ...(q.status ? { status: q.status } : {}), ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [items, total] = await Promise.all([
    prisma.dataset.findMany({ where, orderBy: { [q.sort]: q.dir }, skip: (q.page - 1) * q.limit, take: q.limit, include: { owner: { select: { name: true } }, _count: { select: { columns: true } } } }),
    prisma.dataset.count({ where })]);
  res.json({ items, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) });
}));

r.post('/preview', writer, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to upload');
  const { headers, rows } = parseFile(req.file.buffer, req.file.originalname);
  const columns = headers.map(name => { const vals = rows.map(x => x[name]); return { name, type: detectType(vals), missing: vals.filter(v => v === null || v === '').length }; });
  const warnings = columns.filter(c => c.missing > 0).map(c => `${c.name}: ${c.missing} missing value(s)`);
  res.json({ fileName: req.file.originalname, fileSize: req.file.size, rowCount: rows.length, columnCount: headers.length, columns, rows: rows.slice(0, 20), mapping: suggestMapping(columns), warnings });
}));

const ImportConfig = z.object({
  name: z.string().trim().min(1).max(120),
  columns: z.array(z.object({ source: z.string(), name: z.string().trim().min(1).max(64), type: z.enum(['number', 'date', 'string']) })).min(1).max(200),
  mapping: z.record(z.string()).default({}),
}).superRefine((c, ctx) => {
  const names = c.columns.map(x => x.name.toLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'Column names must be unique' });
  for (const [role, col] of Object.entries(c.mapping)) {
    if (!(role in MAPPING_ROLES)) ctx.addIssue({ code: 'custom', message: `Unknown mapping "${role}"` });
    const t = c.columns.find(x => x.name === col)?.type, want = MAPPING_ROLES[role];
    if (!t) ctx.addIssue({ code: 'custom', message: `Mapped column "${col}" does not exist` });
    else if (want && t !== want) ctx.addIssue({ code: 'custom', message: `"${role}" must be a ${want} column` });
  }
});
r.post('/import', writer, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to upload');
  let raw: unknown; try { raw = JSON.parse(String(req.body.config ?? '')); } catch { throw new HttpError(400, 'Invalid import configuration'); }
  const cfg = ImportConfig.parse(raw);
  const { headers, rows } = parseFile(req.file.buffer, req.file.originalname);
  for (const c of cfg.columns) if (!headers.includes(c.source)) throw new HttpError(400, `Column "${c.source}" is not in the file`);
  const invalid: Record<string, number> = {};
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const o: Record<string, unknown> = {}; let any = false;
    for (const c of cfg.columns) {
      const v = row[c.source]; const empty = v === null || v === undefined || String(v).trim() === '';
      const cv = empty ? null : c.type === 'number' ? toNumber(v) : c.type === 'date' ? toDate(v) : String(v).trim();
      if (!empty && cv === null) invalid[c.name] = (invalid[c.name] ?? 0) + 1;
      if (cv !== null) any = true;
      o[c.name] = cv;
    }
    if (any) out.push(o);
  }
  const ds = await prisma.dataset.create({ data: { name: cfg.name, filename: req.file.originalname, ownerId: req.user!.id, status: 'IMPORTING', mapping: cfg.mapping,
    columns: { create: cfg.columns.map((c, position) => ({ name: c.name, type: c.type, position })) } } });
  try {
    await insertRows(ds.id, out);
    const done = await prisma.dataset.update({ where: { id: ds.id }, data: { status: 'READY', rowCount: out.length } });
    await audit(req.user!.id, 'dataset.import', 'dataset', ds.id, `${out.length} rows from ${req.file.originalname}`);
    res.status(201).json({ dataset: done, imported: out.length, skipped: rows.length - out.length, warnings: Object.entries(invalid).map(([k, n]) => `${k}: ${n} value(s) could not be converted and were left empty`) });
  } catch (e) { await prisma.dataset.update({ where: { id: ds.id }, data: { status: 'FAILED' } }); throw e; }
}));

r.post('/demo', writer, wrap(async (req, res) => { const ds = await createDemoDataset(req.user!.id); await audit(req.user!.id, 'dataset.demo', 'dataset', ds.id); res.status(201).json({ dataset: ds }); }));

r.get('/:id', wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id);
  const columns = await prisma.datasetColumn.findMany({ where: { datasetId: ds.id }, orderBy: { position: 'asc' } });
  const dashboards = await prisma.dashboard.findMany({ where: ownerFilter(req.user!), select: { id: true, name: true, widgets: true } });
  const usedBy = dashboards.filter(d => (d.widgets as { datasetId?: string }[]).some(w => w.datasetId === ds.id)).map(d => ({ id: d.id, name: d.name }));
  res.json({ dataset: ds, columns, usedBy });
}));
r.get('/:id/columns', wrap(async (req, res) => { const ds = await getDataset(req.user!, req.params.id); res.json({ columns: await prisma.datasetColumn.findMany({ where: { datasetId: ds.id }, orderBy: { position: 'asc' } }), mapping: ds.mapping }); }));
r.get('/:id/preview', wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id), cols = await loadCols(ds.id);
  const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), sort: z.string().optional(), dir: z.enum(['asc', 'desc']).default('asc'), search: z.string().max(100).optional() }).parse(req.query);
  if (q.sort && !cols.has(q.sort)) throw new HttpError(400, 'Unknown sort column');
  const search = q.search ? Prisma.sql`AND "data"::text ILIKE ${'%' + q.search.replace(/[%_\\]/g, '\\$&') + '%'}` : Prisma.empty;
  const order = q.sort ? Prisma.sql`ORDER BY ${colSql(q.sort, cols.get(q.sort)!)} ${Prisma.raw(q.dir === 'desc' ? 'DESC' : 'ASC')} NULLS LAST, id` : Prisma.sql`ORDER BY id`;
  const [rows, [t]] = await Promise.all([
    prisma.$queryRaw<{ data: unknown }[]>(Prisma.sql`SELECT "data" FROM "DatasetRow" WHERE "datasetId" = ${ds.id} ${search} ${order} LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::float8 AS n FROM "DatasetRow" WHERE "datasetId" = ${ds.id} ${search}`)]);
  res.json({ rows: rows.map(x => x.data), total: t?.n ?? 0, page: q.page, pages: Math.max(1, Math.ceil((t?.n ?? 0) / q.limit)) });
}));
r.get('/:id/distinct', wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id), cols = await loadCols(ds.id), f = String(req.query.field ?? '');
  if (!cols.has(f)) throw new HttpError(400, 'Unknown field');
  const rows = await prisma.$queryRaw<{ v: string }[]>(Prisma.sql`SELECT DISTINCT ("data"->>${f}) AS v FROM "DatasetRow" WHERE "datasetId" = ${ds.id} AND "data"->>${f} IS NOT NULL ORDER BY 1 LIMIT 100`);
  res.json({ values: rows.map(x => x.v) });
}));
r.get('/:id/range', wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id), f = (ds.mapping as Record<string, string>).date;
  if (!f) return res.json({ min: null, max: null });
  const [x] = await prisma.$queryRaw<{ min: Date | null; max: Date | null }[]>(Prisma.sql`SELECT MIN(${colSql(f, 'date')}) AS min, MAX(${colSql(f, 'date')}) AS max FROM "DatasetRow" WHERE "datasetId" = ${ds.id}`);
  res.json({ min: x?.min?.toISOString().slice(0, 10) ?? null, max: x?.max?.toISOString().slice(0, 10) ?? null });
}));
r.get('/:id/export', wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id), cols = [...(await loadCols(ds.id)).keys()];
  const fmt = req.query.format === 'xlsx' ? 'xlsx' : 'csv', safe = ds.name.replace(/[^\w.-]+/g, '_');
  const esc = (v: unknown) => { const s = String(sanitizeCell(v) ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  if (fmt === 'csv') { // streamed in batches so memory stays flat
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
    res.write(cols.map(esc).join(',') + '\n');
    let last = 0;
    for (;;) {
      const batch = await prisma.datasetRow.findMany({ where: { datasetId: ds.id, id: { gt: last } }, orderBy: { id: 'asc' }, take: 5000 });
      if (!batch.length) break;
      for (const b of batch) res.write(cols.map(c => esc((b.data as Record<string, unknown>)[c])).join(',') + '\n');
      last = batch[batch.length - 1].id;
    }
    return void res.end();
  }
  if (ds.rowCount > 50_000) throw new HttpError(400, 'XLSX export is limited to 50,000 rows. Use CSV for larger datasets.');
  const data = (await prisma.datasetRow.findMany({ where: { datasetId: ds.id }, orderBy: { id: 'asc' } })).map(b => cols.map(c => sanitizeCell((b.data as Record<string, unknown>)[c]) ?? null));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...data]), 'Data');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
  res.end(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}));
r.patch('/:id', writer, wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id), b = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
  res.json({ dataset: await prisma.dataset.update({ where: { id: ds.id }, data: { name: b.name } }) });
}));
r.delete('/:id', writer, wrap(async (req, res) => {
  const ds = await getDataset(req.user!, req.params.id);
  await prisma.dataset.delete({ where: { id: ds.id } });
  await audit(req.user!.id, 'dataset.delete', 'dataset', ds.id, ds.name);
  res.json({ ok: true });
}));
export default r;
