import { ApiError } from '../../utils/http.js';
import { PROJECT_ROLES } from '../../config/constants.js';
import ProjectRole from '../../models/project/projectRoles.model.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// Stored member role: system role name, or custom role _id as string.
export async function resolveRoleValue(projectId, { role, roleId }) {
  if (roleId) {
    const doc = await ProjectRole.findOne({ _id: roleId, projectId }).select('_id').lean();
    if (!doc) throw new ApiError(422, 'Unknown project role');
    return { value: String(doc._id) };
  }
  if (!PROJECT_ROLES.includes(role)) throw new ApiError(422, 'Unknown project role');
  return { value: role };
}

// Keeps projectRoles.memberCount in sync with membership changes.
export async function bumpRoleMemberCount(projectId, value, delta) {
  if (!value) return;
  const filter = OBJECT_ID.test(value)
    ? { _id: value, projectId }
    : { projectId, name: value, isSystem: true };
  await ProjectRole.updateOne(filter, { $inc: { memberCount: delta } });
}
