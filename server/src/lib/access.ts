import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AuthUser, HttpError } from '../middleware';
export const ownerFilter = (u: AuthUser) => (u.role === 'ADMIN' ? {} : { ownerId: u.id });
/** Loads a dataset the user may access; otherwise 404 (never reveals other users' IDs). */
export async function getDataset(u: AuthUser, id: string) {
  const ds = await prisma.dataset.findFirst({ where: { id, ...ownerFilter(u) } });
  if (!ds) throw new HttpError(404, 'Dataset not found');
  return ds;
}
export const audit = (userId: string | null, action: string, entity?: string, entityId?: string, detail?: string) =>
  prisma.auditLog.create({ data: { userId, action, entity, entityId, detail } }).catch(() => undefined);
export async function insertRows(datasetId: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000)
    await prisma.datasetRow.createMany({ data: rows.slice(i, i + 1000).map(data => ({ datasetId, data: data as Prisma.InputJsonValue })) });
}
