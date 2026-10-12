import { prisma } from '../db';
import { insertRows } from './access';
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PRODUCTS: [string, string, number, number][] = [
  ['Laptop Pro 14', 'Electronics', 62000, 0.78], ['Wireless Earbuds', 'Electronics', 4500, 0.6], ['Smartphone X', 'Electronics', 28000, 0.82],
  ['Office Chair', 'Furniture', 9500, 0.65], ['Standing Desk', 'Furniture', 18000, 0.7], ['Bookshelf', 'Furniture', 6500, 0.62],
  ['Notebook Pack', 'Stationery', 450, 0.45], ['Gel Pens (12)', 'Stationery', 220, 0.4], ['Desk Organizer', 'Stationery', 900, 0.5],
  ['Running Shoes', 'Apparel', 5200, 0.55], ['Winter Jacket', 'Apparel', 7800, 0.58], ['Backpack', 'Apparel', 2400, 0.5]];
const REGIONS = ['North', 'South', 'East', 'West', 'Central'], CHANNELS = ['Online', 'Retail Store', 'Distributor'], SEGMENTS = ['Consumer', 'Corporate', 'Small Business'];
export const SAMPLE_COLUMNS = [['order_id', 'string'], ['order_date', 'date'], ['product', 'string'], ['category', 'string'], ['region', 'string'], ['sales_channel', 'string'], ['customer_segment', 'string'], ['quantity', 'number'], ['revenue', 'number'], ['cost', 'number'], ['profit', 'number'], ['customer_id', 'string']] as const;
export const SAMPLE_MAPPING = { date: 'order_date', revenue: 'revenue', cost: 'cost', profit: 'profit', quantity: 'quantity', orderId: 'order_id', product: 'product', category: 'category', region: 'region', channel: 'sales_channel', customer: 'customer_id', segment: 'customer_segment' };
export function generateSales(n = 2400, endDate = new Date()) {
  const r = rng(42), rows: Record<string, unknown>[] = [], days = 540;
  for (let i = 0; i < n; i++) {
    const age = Math.floor(Math.pow(r(), 0.8) * days), d = new Date(endDate.getTime() - age * 864e5), month = d.getUTCMonth();
    const [product, category, price, costRatio] = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
    const season = [10, 11, 0].includes(month) ? 1.35 : 1, qty = 1 + Math.floor(r() * 4), rev = Math.round(price * qty * (0.92 + r() * 0.16) * season);
    const cost = Math.round(rev * (costRatio + (r() - 0.5) * 0.06));
    rows.push({ order_id: `ORD-${String(10000 + i)}`, order_date: d.toISOString().slice(0, 10), product, category, region: REGIONS[Math.floor(r() * REGIONS.length)], sales_channel: CHANNELS[Math.floor(r() * 3)],
      customer_segment: SEGMENTS[Math.floor(r() * 3)], quantity: qty, revenue: rev, cost, profit: rev - cost, customer_id: `C${String(1 + Math.floor(Math.pow(r(), 1.3) * 400)).padStart(4, '0')}` });
  }
  return rows;
}
export async function createDemoDataset(ownerId: string) {
  const rows = generateSales();
  const ds = await prisma.dataset.create({ data: { name: 'Demo Sales Data (sample)', filename: 'generated-sample', source: 'demo', isDemo: true, ownerId, status: 'IMPORTING', mapping: SAMPLE_MAPPING,
    columns: { create: SAMPLE_COLUMNS.map(([name, type], position) => ({ name, type, position })) } } });
  await insertRows(ds.id, rows);
  return prisma.dataset.update({ where: { id: ds.id }, data: { status: 'READY', rowCount: rows.length } });
}
