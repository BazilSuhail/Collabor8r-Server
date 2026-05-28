// Admin-level audit trail writer. Failures are logged, never thrown.
import { logger } from '../utils/logger.js';
import { AuditLog } from '../models/index.js';
import { env } from '../config/env.js';
import { actorOf } from './activity.service.js';

const DAY_MS = 86_400_000;

export const writeAudit = async ({
  req,
  orgId = null,
  projectId = null,
  action,
  targetType,
  targetId,
  targetName,
  before,
  after,
  actor,
}) => {
  try {
    const who = actor ?? (req?.user ? await actorOf({ id: req.user.id }) : null);
    const at = new Date();
    await AuditLog.create({
      orgId,
      projectId,
      actorId: who?.id ?? null,
      actorName: who?.name ?? null,
      actorIp: req?.ip ?? null,
      action,
      targetType,
      targetId,
      targetName,
      before,
      after,
      at,
      expireAt: new Date(at.getTime() + env.auditRetentionDays * DAY_MS),
    });
  } catch (err) {
    logger.error('Audit write failed:', err.message);
  }
};
