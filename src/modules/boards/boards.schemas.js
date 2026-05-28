import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';
import { pageQuerySchema } from '../../utils/pagination.js';

const column = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(1).max(60),
  statusIds: z.array(objectId).max(50),
  wipLimit: z.number().int().min(0).nullable().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const boardBase = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['scrum', 'kanban']).optional(),
  columns: z.array(column).min(1).max(15).optional(),
  swimlaneBy: z.enum(['none', 'assignee', 'epic', 'priority', 'type']).optional(),
  cardFields: z.array(z.string().max(60)).max(20).optional(),
  showSubtasks: z.boolean().optional(),
  showDoneColumn: z.boolean().optional(),
  filter: z.object({
    savedFilterId: objectId.nullable().optional(),
    query: z.string().max(1000).optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
});

export const createBoardSchema = boardBase;
export const updateBoardSchema = boardBase.partial();

export const boardQuerySchema = z.object({
  sprintId: objectId.optional(),
  assigneeId: objectId.optional(),
  label: z.string().trim().max(50).optional(),
});

export const backlogQuerySchema = pageQuerySchema.extend({
  assigneeId: objectId.optional(),
});

export const rankIssueSchema = z.object({
  beforeId: objectId.nullable().optional(),
  afterId: objectId.nullable().optional(),
  sprintId: objectId.nullable().optional(),
});
