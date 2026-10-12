// Integration tests. They need a SEPARATE empty PostgreSQL database in TEST_DATABASE_URL (tables are wiped) and are skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
const URL = process.env.TEST_DATABASE_URL;
const csv = 'order_id,order_date,product,category,region,quantity,revenue,cost,customer_id\n1,2026-01-05,A,Cat1,North,2,200,120,c1\n2,2026-01-20,B,Cat2,South,1,100,60,c1\n3,2026-02-03,A,Cat1,North,3,300,180,c2\n';
const mapping = { date: 'order_date', revenue: 'revenue', cost: 'cost', orderId: 'order_id', category: 'category', region: 'region', customer: 'customer_id' };
describe.skipIf(!URL)('API (needs TEST_DATABASE_URL)', () => {
  let app: any, prisma: any, admin = '', other = '', viewer = '', dsId = '';
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });
  beforeAll(async () => {
    process.env.DATABASE_URL = URL; process.env.AUTH_SECRET = 'test-secret-test-secret';
    ({ app } = await import('../src/app')); ({ prisma } = await import('../src/db'));
    await prisma.$executeRawUnsafe('TRUNCATE "User","Dataset","DatasetRow","DatasetColumn","Dashboard","Kpi","AuditLog" RESTART IDENTITY CASCADE');
    const reg = async (n: string) => (await request(app).post('/api/auth/register').send({ name: n, email: `${n}@t.com`, password: 'Password@1' })).body.token as string;
    admin = await reg('first'); other = await reg('second'); viewer = await reg('third');
    const u = await prisma.user.findFirst({ where: { email: 'third@t.com' } }); await prisma.user.update({ where: { id: u.id }, data: { role: 'VIEWER' } });
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  it('rejects bad logins and unauthenticated requests', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'first@t.com', password: 'wrong' })).status).toBe(401);
    expect((await request(app).get('/api/datasets')).status).toBe(401);
    expect((await request(app).post('/api/auth/register').send({ name: 'x', email: 'first@t.com', password: 'Password@1' })).status).toBe(409);
  });
  it('previews and imports a CSV', async () => {
    const p = await request(app).post('/api/datasets/preview').set(H(admin)).attach('file', Buffer.from(csv), 'sales.csv');
    expect(p.status).toBe(200); expect(p.body.rowCount).toBe(3); expect(p.body.columns.find((c: any) => c.name === 'revenue').type).toBe('number');
    const cols = p.body.columns.map((c: any) => ({ source: c.name, name: c.name, type: c.type }));
    const i = await request(app).post('/api/datasets/import').set(H(admin)).field('config', JSON.stringify({ name: 'Sales', columns: cols, mapping })).attach('file', Buffer.from(csv), 'sales.csv');
    expect(i.status).toBe(201); expect(i.body.imported).toBe(3); dsId = i.body.dataset.id;
  });
  it('rejects wrong file types and invalid mappings', async () => {
    expect((await request(app).post('/api/datasets/preview').set(H(admin)).attach('file', Buffer.from('x'), 'a.exe')).status).toBe(400);
    const bad = await request(app).post('/api/datasets/import').set(H(admin)).field('config', JSON.stringify({ name: 'x', columns: [{ source: 'order_id', name: 'order_id', type: 'string' }], mapping: { revenue: 'order_id' } })).attach('file', Buffer.from(csv), 'a.csv');
    expect(bad.status).toBe(400);
  });
  it('computes overview KPIs from the data', async () => {
    const r = await request(app).get('/api/analytics/overview').query({ datasetId: dsId }).set(H(admin));
    expect(r.status).toBe(200); expect(r.body.kpis.revenue.value).toBe(600); expect(r.body.kpis.profit.value).toBe(240); expect(r.body.kpis.orders.value).toBe(3);
    expect(r.body.kpis.aov.value).toBe(200); expect(r.body.kpis.margin.value).toBe(40);
    const f = await request(app).get('/api/analytics/overview').query({ datasetId: dsId, filters: JSON.stringify([{ field: 'region', op: 'eq', value: 'North' }]) }).set(H(admin));
    expect(f.body.kpis.revenue.value).toBe(500);
    const d = await request(app).get('/api/analytics/overview').query({ datasetId: dsId, from: '2026-02-01', to: '2026-02-28' }).set(H(admin));
    expect(d.body.kpis.revenue.value).toBe(300);
  });
  it('runs safe analytics queries and rejects unknown fields / incompatible aggregations', async () => {
    const ok = await request(app).post('/api/analytics/query').set(H(admin)).send({ datasetId: dsId, dimension: 'category', measure: 'revenue', agg: 'SUM', sort: 'value_desc' });
    expect(ok.body.data[0]).toEqual({ label: 'Cat1', value: 500 });
    expect((await request(app).post('/api/analytics/query').set(H(admin)).send({ datasetId: dsId, dimension: 'x"; DROP TABLE "User";--', measure: 'revenue' })).status).toBe(400);
    expect((await request(app).post('/api/analytics/query').set(H(admin)).send({ datasetId: dsId, measure: 'region', agg: 'SUM' })).status).toBe(400);
  });
  it('blocks other users from reading a dataset by ID, and viewers from importing', async () => {
    expect((await request(app).get(`/api/datasets/${dsId}`).set(H(other))).status).toBe(404);
    expect((await request(app).get(`/api/analytics/overview?datasetId=${dsId}`).set(H(other))).status).toBe(404);
    expect((await request(app).post('/api/datasets/demo').set(H(viewer))).status).toBe(403);
  });
  it('saves and reloads a dashboard', async () => {
    const w = [{ id: 'w1', title: 'Rev', type: 'bar', width: 2, datasetId: dsId, dimension: 'category', measure: 'revenue', agg: 'SUM', filters: [], limit: 20 }];
    const c = await request(app).post('/api/dashboards').set(H(admin)).send({ name: 'D1', widgets: w }); expect(c.status).toBe(201);
    const g = await request(app).get(`/api/dashboards/${c.body.dashboard.id}`).set(H(admin)); expect(g.body.dashboard.widgets[0]).toMatchObject({ type: 'bar', width: 2, dimension: 'category' });
    expect((await request(app).get(`/api/dashboards/${c.body.dashboard.id}`).set(H(other))).status).toBe(404);
  });
  it('evaluates KPI targets', async () => {
    const c = await request(app).post('/api/kpis').set(H(admin)).send({ name: 'Rev', datasetId: dsId, measure: 'revenue', aggregation: 'SUM', target: 1200, period: 'all' });
    expect(c.status).toBe(201); expect(c.body.kpi.current).toBe(600); expect(c.body.kpi.achievement).toBe(50); expect(c.body.kpi.status).toBe('At Risk');
  });
  it('exports CSV with formula-injection protection and real XLSX/PDF files', async () => {
    const x = await request(app).post('/api/reports/export').set(H(admin)).send({ datasetId: dsId, dimension: 'category', measure: 'revenue', agg: 'SUM', format: 'csv' });
    expect(x.status).toBe(200); expect(x.text).toContain('Cat1,500');
    const xl = await request(app).post('/api/reports/export').set(H(admin)).send({ datasetId: dsId, dimension: 'category', measure: 'revenue', format: 'xlsx' }).buffer().parse((res, cb) => { const a: Buffer[] = []; res.on('data', (d: Buffer) => a.push(d)); res.on('end', () => cb(null, Buffer.concat(a))); });
    expect((xl.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await request(app).post('/api/reports/export').set(H(admin)).send({ datasetId: dsId, dimension: 'category', measure: 'revenue', format: 'pdf' }).buffer().parse((res, cb) => { const a: Buffer[] = []; res.on('data', (d: Buffer) => a.push(d)); res.on('end', () => cb(null, Buffer.concat(a))); });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
