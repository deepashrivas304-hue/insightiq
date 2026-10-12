import { describe, expect, it } from 'vitest';
import { aov, kpiStatus, margin, pctChange, profit, safeDiv } from '../src/lib/metrics';
import { detectType, normalizeHeaders, parseFile, sanitizeCell, suggestMapping, toDate, toNumber } from '../src/lib/parse';
describe('metrics', () => {
  it('computes percentage change and guards zero/missing previous', () => {
    expect(pctChange(120, 100)).toBeCloseTo(20); expect(pctChange(80, 100)).toBeCloseTo(-20);
    expect(pctChange(50, 0)).toBeNull(); expect(pctChange(50, null)).toBeNull();
  });
  it('computes profit, margin and AOV', () => {
    expect(profit(1000, 600)).toBe(400); expect(margin(400, 1000)).toBe(40); expect(margin(5, 0)).toBeNull();
    expect(aov(600, 3)).toBe(200); expect(aov(600, 0)).toBeNull(); expect(safeDiv(1, 0)).toBeNull();
  });
  it('classifies KPI status', () => {
    expect(kpiStatus(100)).toBe('Achieved'); expect(kpiStatus(82)).toBe('On Track'); expect(kpiStatus(50)).toBe('At Risk'); expect(kpiStatus(20)).toBe('Below Target');
  });
});
describe('parsing', () => {
  it('parses numbers with symbols and rejects text', () => {
    expect(toNumber('₹1,25,000.50')).toBe(125000.5); expect(toNumber('(200)')).toBe(-200); expect(toNumber('abc')).toBeNull(); expect(toNumber('')).toBeNull(); expect(toNumber(7)).toBe(7);
  });
  it('parses dates and rejects invalid ones', () => {
    expect(toDate('2026-03-05')).toBe('2026-03-05'); expect(toDate('05/03/2026')).toBe('2026-03-05'); expect(toDate('31/02/2026')).toBeNull(); expect(toDate('2026-02-31')).toBeNull(); expect(toDate('hello')).toBeNull();
  });
  it('detects column types tolerating a few bad values', () => {
    expect(detectType(['1', '2', '3', '', null])).toBe('number'); expect(detectType(['2026-01-01', '2026-01-02'])).toBe('date'); expect(detectType(['a', 'b', '1'])).toBe('string'); expect(detectType([])).toBe('string');
  });
  it('makes duplicate and empty headers unique', () => { expect(normalizeHeaders(['a', 'A', ' ', 'b c'])).toEqual(['a', 'A_2', 'column_3', 'b_c']); });
  it('parses CSV with missing values and duplicate headers', () => {
    const { headers, rows } = parseFile(Buffer.from('id,amount,amount\n1,10,\n2,,5\n'), 'x.csv');
    expect(headers).toEqual(['id', 'amount', 'amount_2']); expect(rows).toHaveLength(2); expect(rows[1].amount).toBeNull();
  });
  it('rejects malformed input', () => {
    expect(() => parseFile(Buffer.from('only,header\n'), 'x.csv')).toThrow(); expect(() => parseFile(Buffer.from('{bad'), 'x.json')).toThrow(); expect(() => parseFile(Buffer.from('[1,2]'), 'x.json')).toThrow();
  });
  it('parses JSON arrays of objects', () => { expect(parseFile(Buffer.from('[{"a":1},{"a":2,"b":"x"}]'), 'x.json').headers).toEqual(['a', 'b']); });
  it('neutralises formula injection', () => {
    expect(sanitizeCell('=SUM(A1)')).toBe("'=SUM(A1)"); expect(sanitizeCell('@cmd')).toBe("'@cmd"); expect(sanitizeCell('+1')).toBe("'+1"); expect(sanitizeCell('plain')).toBe('plain'); expect(sanitizeCell(-5)).toBe(-5);
  });
  it('suggests business-field mappings', () => {
    const m = suggestMapping([{ name: 'order_date', type: 'date' }, { name: 'revenue', type: 'number' }, { name: 'cost', type: 'number' }, { name: 'order_id', type: 'string' }]);
    expect(m).toMatchObject({ date: 'order_date', revenue: 'revenue', cost: 'cost', orderId: 'order_id' });
  });
});
