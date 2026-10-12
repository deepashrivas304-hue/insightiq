import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { auth, wrap } from '../middleware';
import { audit, getDataset } from '../lib/access';
import { loadCols, QuerySchema, runQuery } from '../lib/query';
import { sanitizeCell } from '../lib/parse';
const r = Router();
r.use(auth);
const ExportSchema = QuerySchema.extend({ format: z.enum(['csv', 'xlsx', 'pdf']), title: z.string().max(120).optional() });
const esc = (v: unknown) => { const s = String(sanitizeCell(v) ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
r.post('/export', wrap(async (req, res) => {
  const q = ExportSchema.parse(req.body), ds = await getDataset(req.user!, q.datasetId);
  const data = await runQuery(q, await loadCols(ds.id)), head = [q.dimension ?? 'Group', `${q.agg}(${q.measure ?? '*'})`];
  const title = q.title || `${ds.name} - ${head[1]}${q.dimension ? ' by ' + q.dimension : ''}`, safe = title.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const filters = [q.from || q.to ? `Date range: ${q.from ?? 'start'} to ${q.to ?? 'end'}` : 'Date range: all', ...q.filters.map(f => `${f.field} ${f.op} ${JSON.stringify(f.value)}`)];
  await audit(req.user!.id, 'report.export', 'dataset', ds.id, q.format);
  if (q.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
    return void res.send([head, ...data.map(d => [d.label, d.value])].map(row => row.map(esc).join(',')).join('\n') + '\n');
  }
  if (q.format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data.map(d => [sanitizeCell(d.label), d.value])]), 'Report');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
    return void res.end(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
  const doc = new PDFDocument({ margin: 40 }); doc.pipe(res);
  doc.fontSize(18).text(title); doc.moveDown(0.3).fontSize(9).fillColor('#555').text(`Generated ${new Date().toISOString().slice(0, 10)} | Dataset: ${ds.name}${ds.isDemo ? ' (demo data)' : ''}`);
  doc.text(filters.join('  |  ')); doc.moveDown().fillColor('#000').fontSize(10);
  const total = data.reduce((a, d) => a + d.value, 0);
  doc.font('Helvetica-Bold').text(`${head[0]}`, 40, doc.y, { continued: false }); doc.font('Helvetica');
  for (const d of data) {
    if (doc.y > 740) doc.addPage();
    const y = doc.y; doc.text(String(d.label).slice(0, 60), 40, y, { width: 280 }); doc.text(d.value.toLocaleString('en-IN', { maximumFractionDigits: 2 }), 330, y, { width: 120, align: 'right' });
    if (q.agg === 'SUM' && total) doc.text(`${((d.value / total) * 100).toFixed(1)}%`, 460, y, { width: 80, align: 'right' });
  }
  doc.end();
}));
export default r;
