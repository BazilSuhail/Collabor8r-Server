import { z } from 'zod';
import { makeProjectCrud } from '../../utils/crud.js';
import { ApiError } from '../../utils/http.js';
import ProjectRole from '../../models/project/projectRoles.model.js';

const roleBody = z.object({
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
  permissions: z.array(z.string().min(1).max(60)).max(100).optional(),
});

// Role name is fixed after creation; member rows reference it.
const createRoleSchema = roleBody.extend({ name: z.string().trim().min(1).max(60) });
const updateRoleSchema = roleBody;

export default makeProjectCrud({
  Model: ProjectRole,
  name: 'role',
  createSchema: createRoleSchema,
  updateSchema: updateRoleSchema,
  roles: { read: 'viewer', create: 'admin', update: 'admin', remove: 'admin' },
  beforeCreate: async (req, body) => ({
    ...body,
    permissions: body.permissions ?? [],
    isSystem: false,
    memberCount: 0,
  }),
  beforeDelete: async (req, doc) => {
    if (doc.isSystem) throw new ApiError(409, 'System roles cannot be deleted');
    if (doc.memberCount > 0) throw new ApiError(409, 'Role is still assigned to members');
  },
});
