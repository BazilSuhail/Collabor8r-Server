import { Router } from 'express';
import { z } from 'zod';
import { makeProjectCrud } from '../../utils/crud.js';
import { objectId } from '../../utils/helpers.js';
import { getPublicUsers } from '../user/user.service.js';
import IssueType from '../../models/project/issueTypes.model.js';
import Priority from '../../models/project/priorities.model.js';
import Resolution from '../../models/project/resolutions.model.js';
import CustomField from '../../models/project/customFields.model.js';
import Label from '../../models/project/labels.model.js';
import Component from '../../models/project/components.model.js';
import SavedFilter from '../../models/project/savedFilters.model.js';

const router = Router({ mergeParams: true });

// Keeps a single default per project for the given model.
const singleDefault = (Model) => async (req, doc, action) => {
  if (action !== 'delete' && doc.isDefault) {
    await Model.updateMany({ projectId: doc.projectId, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
  }
};

// Stores the lead's display name next to the lead id.
const syncComponentLead = async (req, doc, action) => {
  if (action === 'delete') return;
  const info = doc.leadId ? (await getPublicUsers([String(doc.leadId)])).get(String(doc.leadId)) : null;
  await Component.updateOne({ _id: doc._id }, { $set: { leadName: info?.displayName ?? '' } });
};

const CONFIG_ROLES = { read: 'viewer', create: 'lead', update: 'lead', remove: 'admin' };

const issueTypeBase = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  hierarchy: z.enum(['epic', 'story', 'task', 'subtask']),
  requiredFields: z.array(z.string().min(1).max(60)).max(30).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

const priorityBase = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  rank: z.number().int().min(1),
  isDefault: z.boolean().optional(),
});

const resolutionBase = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
  countsAsDone: z.boolean(),
  sortOrder: z.number().int().min(0).optional(),
});

const customFieldBase = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  fieldType: z.enum(['text', 'longText', 'number', 'money', 'date', 'select', 'multiSelect', 'user', 'url', 'checkbox', 'rating', 'formula']),
  options: z.array(z.object({
    value: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    color: z.string().max(20).optional(),
  })).max(100).optional(),
  formula: z.string().max(2000).optional(),
  required: z.boolean().optional(),
  showOnCard: z.boolean().optional(),
  showInList: z.boolean().optional(),
  issueTypeIds: z.array(objectId).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const labelBase = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().max(20).optional(),
  description: z.string().max(300).optional(),
});

const componentBase = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  leadId: objectId.nullable().optional(),
  color: z.string().max(20).optional(),
});

const savedFilterBase = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  query: z.string().max(2000).optional(),
  columns: z.array(z.string().min(1).max(60)).max(30).optional(),
  sort: z.object({
    field: z.string().min(1).max(60),
    direction: z.enum(['asc', 'desc']),
  }).optional(),
  groupBy: z.enum(['none', 'status', 'assignee', 'epic', 'priority', 'sprint']).optional(),
  sharedWith: z.object({
    scope: z.enum(['private', 'project', 'org']),
    userIds: z.array(objectId).max(100).optional(),
  }).optional(),
  isPinned: z.boolean().optional(),
});

const customFieldCreate = customFieldBase.refine(
  (v) => v.fieldType !== 'formula' || Boolean(v.formula),
  { message: 'formula is required for formula fields' },
);

router.use('/issue-types', makeProjectCrud({
  Model: IssueType,
  name: 'issueType',
  createSchema: issueTypeBase,
  updateSchema: issueTypeBase.partial(),
  roles: CONFIG_ROLES,
  afterWrite: singleDefault(IssueType),
}));

router.use('/priorities', makeProjectCrud({
  Model: Priority,
  name: 'priority',
  createSchema: priorityBase,
  updateSchema: priorityBase.partial(),
  roles: CONFIG_ROLES,
  afterWrite: singleDefault(Priority),
}));

router.use('/resolutions', makeProjectCrud({
  Model: Resolution,
  name: 'resolution',
  createSchema: resolutionBase,
  updateSchema: resolutionBase.partial(),
  roles: CONFIG_ROLES,
}));

router.use('/custom-fields', makeProjectCrud({
  Model: CustomField,
  name: 'customField',
  createSchema: customFieldCreate,
  updateSchema: customFieldBase.partial(),
  roles: CONFIG_ROLES,
}));

router.use('/labels', makeProjectCrud({
  Model: Label,
  name: 'label',
  createSchema: labelBase,
  updateSchema: labelBase.partial(),
  searchFields: ['name'],
  roles: { read: 'viewer', create: 'reporter', update: 'lead', remove: 'admin' },
}));

router.use('/components', makeProjectCrud({
  Model: Component,
  name: 'component',
  createSchema: componentBase,
  updateSchema: componentBase.partial(),
  searchFields: ['name'],
  roles: CONFIG_ROLES,
  afterWrite: syncComponentLead,
}));

// Owners edit and delete their own filters; leads may manage others.
router.use('/saved-filters', makeProjectCrud({
  Model: SavedFilter,
  name: 'savedFilter',
  createSchema: savedFilterBase,
  updateSchema: savedFilterBase.partial(),
  searchFields: ['name'],
  roles: { read: 'viewer', create: 'reporter', update: 'lead', remove: 'lead' },
  ownerField: 'ownerId',
  beforeCreate: async (req, body) => ({
    ...body,
    ownerId: req.user.id,
    orgId: req.project.orgId ?? null,
    query: body.query ?? '',
  }),
}));

export default router;
