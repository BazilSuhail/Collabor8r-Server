import { SlaTimer, SlaPolicy, Issue, RequestType, Project } from '../../models/index.js';
import { logger } from '../../utils/logger.js';
import { onEvent, emitEvent } from '../../services/events.service.js';
import { notify } from '../../services/notify.service.js';

const TICK_MS = 60000;

async function startTimers(event) {
  const issue = await Issue.findOne({ _id: event.issueId, projectId: event.projectId }).select('type').lean();
  if (!issue) return;
  const request = await RequestType.findOne({ projectId: event.projectId, issueTypeId: issue.type, slaPolicyId: { $ne: null } }).lean();
  let policy = request ? await SlaPolicy.findOne({ _id: request.slaPolicyId, projectId: event.projectId }).lean() : null;
  policy ??= await SlaPolicy.findOne({ projectId: event.projectId, isDefault: true }).lean();
  if (!policy) return;
  const start = new Date(event.at ?? Date.now());
  const metrics = [
    ['firstResponse', policy.targets?.firstResponseMinutes],
    ['resolution', policy.targets?.resolutionMinutes],
  ];
  for (const [metric, minutes] of metrics) {
    if (!minutes) continue;
    // Upsert keeps a replayed issue.created event from creating a second timer.
    await SlaTimer.updateOne(
      { issueId: event.issueId, metric },
      {
        $setOnInsert: {
          projectId: event.projectId,
          issueId: event.issueId,
          slaPolicyId: policy._id,
          metric,
          startedAt: start,
          pausedAt: null,
          pausedSeconds: 0,
          dueAt: new Date(start.getTime() + minutes * 60000),
          status: 'running',
        },
      },
      { upsert: true },
    );
  }
}

// Pauses or resumes timers by status, and marks them met when the issue is done.
async function applyStatus(event) {
  const timers = await SlaTimer.find({ projectId: event.projectId, issueId: event.issueId, status: { $in: ['running', 'paused'] } }).lean();
  if (!timers.length) return;
  const issue = await Issue.findOne({ _id: event.issueId, projectId: event.projectId }).select('statusId statusCategory').lean();
  if (!issue) return;
  const now = new Date();
  for (const timer of timers) {
    if (issue.statusCategory === 'done') {
      await SlaTimer.updateOne({ _id: timer._id }, { $set: { status: 'met', metAt: now, pausedAt: null } });
      continue;
    }
    const policy = await SlaPolicy.findById(timer.slaPolicyId).select('pauseStatusIds').lean();
    const paused = (policy?.pauseStatusIds ?? []).map(String).includes(String(issue.statusId));
    if (paused && timer.status === 'running') {
      await SlaTimer.updateOne({ _id: timer._id }, { $set: { status: 'paused', pausedAt: now } });
    } else if (!paused && timer.status === 'paused') {
      const pausedMs = now - new Date(timer.pausedAt ?? now);
      await SlaTimer.updateOne(
        { _id: timer._id },
        {
          $set: { status: 'running', pausedAt: null, dueAt: new Date(new Date(timer.dueAt).getTime() + pausedMs) },
          $inc: { pausedSeconds: Math.round(pausedMs / 1000) },
        },
      );
    }
  }
}

async function breachDueTimers() {
  const now = new Date();
  const due = await SlaTimer.find({ status: 'running', dueAt: { $lte: now } }).lean();
  for (const timer of due) {
    const res = await SlaTimer.updateOne({ _id: timer._id, status: 'running' }, { $set: { status: 'breached', breachedAt: now } });
    if (!res.modifiedCount) continue;
    const issue = await Issue.findOne({ _id: timer.issueId, projectId: timer.projectId }).select('key assigneeId').lean();
    if (!issue) continue;
    const policy = await SlaPolicy.findById(timer.slaPolicyId).select('escalateToUserId').lean();
    const project = await Project.findById(timer.projectId).select('orgId').lean();
    const orgId = project?.orgId ?? null;
    const recipients = [issue.assigneeId, policy?.escalateToUserId].filter(Boolean).map(String);
    if (recipients.length) {
      await notify({
        userIds: [...new Set(recipients)],
        type: 'slaBreach',
        title: `SLA breached: ${issue.key}`,
        body: `${timer.metric} target missed`,
        projectId: timer.projectId,
        orgId,
        link: { kind: 'issue', id: timer.issueId, key: issue.key },
      });
    }
    emitEvent({
      type: 'issue.updated',
      orgId,
      projectId: timer.projectId,
      actorId: null,
      issueId: timer.issueId,
      changes: { sla: { from: 'running', to: 'breached' } },
      payload: { metric: timer.metric },
      at: now,
    });
  }
}

let registered = false;

// Registers event handlers and a 60 s breach ticker. Returns a stop function. Safe to call once per process.
export function registerSlaTicker() {
  if (registered) return () => {};
  registered = true;
  onEvent(async (event) => {
    if (!event.projectId || !event.issueId) return;
    try {
      if (event.type === 'issue.created') await startTimers(event);
      else if (event.type === 'issue.transitioned' || event.type === 'issue.updated') await applyStatus(event);
    } catch (err) {
      logger.error('sla event handling failed', err);
    }
  });
  let running = false;
  const tick = async () => {
    if (running) return; // previous run still in progress
    running = true;
    try {
      await breachDueTimers();
    } catch (err) {
      logger.error('sla tick failed', err);
    } finally {
      running = false;
    }
  };
  tick(); // catch timers that came due while the server was down; breaching is atomic, so restarts are safe
  const interval = setInterval(tick, TICK_MS);
  interval.unref();
  return () => clearInterval(interval);
}
