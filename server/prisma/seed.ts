import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import { createDemoDataset } from '../src/lib/sampleData';
async function main() {
  const mk = (name: string, email: string, role: 'ADMIN' | 'ANALYST' | 'VIEWER', pw: string) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, passwordHash: bcrypt.hashSync(pw, 10) } });
  const admin = await mk('Admin User', 'admin@insightiq.local', 'ADMIN', 'Admin@1234');
  await mk('Ava Analyst', 'analyst@insightiq.local', 'ANALYST', 'Analyst@1234');
  await mk('Victor Viewer', 'viewer@insightiq.local', 'VIEWER', 'Viewer@1234');
  await prisma.dataset.deleteMany({ where: { ownerId: admin.id, isDemo: true } });
  const ds = await createDemoDataset(admin.id);
  await prisma.kpi.deleteMany({ where: { ownerId: admin.id } });
  await prisma.kpi.createMany({ data: [
    { name: 'Monthly Revenue Target', datasetId: ds.id, measure: 'revenue', aggregation: 'SUM', target: 1000000, ownerId: admin.id },
    { name: 'Monthly Profit', datasetId: ds.id, measure: 'profit', aggregation: 'SUM', target: 300000, ownerId: admin.id },
    { name: 'Monthly Order Volume', datasetId: ds.id, measure: 'order_id', aggregation: 'COUNT', target: 250, ownerId: admin.id }] });
  console.log(`Seeded ${ds.rowCount} demo orders. Login: admin@insightiq.local / Admin@1234`);
}
main().finally(() => prisma.$disconnect());
