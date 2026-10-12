import Papa from 'papaparse';
import * as XLSX from 'xlsx';
export type ColType = 'number' | 'date' | 'string';
export const MAX_ROWS = 200_000;
export class ParseError extends Error {}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Returns YYYY-MM-DD. Accepts ISO dates, Date objects and DD/MM/YYYY (day-first assumption). */
export function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.slice(0, 10) + 'T00:00:00Z'); return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s.slice(0, 10) ? null : s.slice(0, 10); }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCMonth() === +m[2] - 1 ? d.toISOString().slice(0, 10) : null; }
  return null;
}
export function detectType(values: unknown[]): ColType {
  const s = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 300);
  if (!s.length) return 'string';
  const ok = (f: (v: unknown) => unknown) => s.filter(v => f(v) !== null).length / s.length >= 0.9;
  if (ok(toNumber)) return 'number';
  if (ok(toDate)) return 'date';
  return 'string';
}
export function normalizeHeaders(headers: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    let name = String(h ?? '').trim().replace(/\s+/g, '_').slice(0, 64) || `column_${i + 1}`;
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    return n > 1 ? `${name}_${n}` : name;
  });
}
export function parseFile(buf: Buffer, filename: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const ext = filename.toLowerCase().split('.').pop();
  let grid: unknown[][] = [];
  try {
    if (ext === 'csv') {
      const r = Papa.parse<unknown[]>(buf.toString('utf8').replace(/^\uFEFF/, ''), { header: false, skipEmptyLines: true });
      grid = r.data as unknown[][];
    } else if (ext === 'xlsx') {
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new ParseError('The workbook has no sheets');
      grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    } else if (ext === 'json') {
      const j = JSON.parse(buf.toString('utf8'));
      const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
      if (!arr || !arr.every((o: unknown) => o && typeof o === 'object' && !Array.isArray(o))) throw new ParseError('JSON must be an array of objects');
      const keys: string[] = [...new Set<string>(arr.flatMap((o: object) => Object.keys(o)))];
      grid = [keys, ...arr.map((o: Record<string, unknown>) => keys.map(k => (typeof o[k] === 'object' && o[k] !== null ? JSON.stringify(o[k]) : o[k])))];
    } else throw new ParseError('Unsupported file type');
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError('The file could not be read. Check that it is a valid ' + ext?.toUpperCase() + ' file.');
  }
  if (grid.length < 2) throw new ParseError('The file needs a header row and at least one data row');
  if (grid.length - 1 > MAX_ROWS) throw new ParseError(`Too many rows (limit ${MAX_ROWS.toLocaleString()})`);
  const headers = normalizeHeaders(grid[0]);
  const rows = grid.slice(1).map(r => Object.fromEntries(headers.map((h, i) => {
  const v = (r as unknown[])[i];
  return [h, v === undefined || v === '' ? null : v]; // empty cells become null
})));
  return { headers, rows };
}
/** Neutralise spreadsheet formula injection in exported text cells. */
export const sanitizeCell = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);

export const MAPPING_ROLES: Record<string, ColType | null> = { date: 'date', revenue: 'number', cost: 'number', profit: 'number', quantity: 'number', orderId: null, product: null, category: null, region: null, channel: null, customer: null, segment: null };
const HINTS: Record<string, RegExp> = { date: /date|time/i, revenue: /revenue|sales|amount|total/i, cost: /cost|cogs/i, profit: /profit/i, quantity: /qty|quantity|units/i, orderId: /order.?(id|no|number)/i, product: /product|item|sku/i, category: /categor/i, region: /region|state|zone|area/i, channel: /channel/i, customer: /customer|client/i, segment: /segment/i };
export function suggestMapping(cols: { name: string; type: ColType }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, re] of Object.entries(HINTS)) {
    const need = MAPPING_ROLES[role];
    const hit = cols.find(c => re.test(c.name) && (!need || c.type === need) && !Object.values(out).includes(c.name));
    if (hit) out[role] = hit.name;
  }
  return out;
}
