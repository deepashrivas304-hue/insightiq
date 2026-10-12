import { app } from './app';
import { config } from './config';
import { prisma } from './db';
prisma.$connect().then(() => app.listen(config.PORT, () => console.log(`InsightIQ API listening on :${config.PORT}`)))
  .catch(e => { console.error('Database connection failed:', e.message); process.exit(1); });
