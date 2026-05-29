// Project role guard, archived-project write block, and permission check helper.
import { PROJECT_ROLE_RANK } from '../config/constants.js';
import { getProjectAccess } from '../services/access.service.js';
import { ApiError } from '../utils/http.js';
import { objectId } from '../utils/helpers.js';

export const requireProjectRole = (minRole) => async (req, res, next) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required');
    const parsed = objectId.safeParse(req.params.projectId);
    if (!parsed.success) throw new ApiError(404, 'Project not found');

    const access = await getProjectAccess(req.user.id, parsed.data);
    if (!access) throw new ApiError(404, 'Project not found');
    if (access.rank < PROJECT_ROLE_RANK[minRole]) throw new ApiError(403, 'Insufficient role');

    const isRestore = access.role === 'admin' && req.path.endsWith('/restore');
    if (access.project.status === 'archived' && req.method !== 'GET' && !isRestore) {
      throw new ApiError(409, 'Project is archived');
    }

    req.project = access.project;
    req.projectRole = access.role;
    req.projectRoleName = access.roleName ?? access.role;
    req.projectPerms = access.perms;
    req.projectOrgRole = access.orgRole;
    next();
  } catch (err) {
    next(err);
  }
};

export const hasPerm = (req, perm) => Boolean(req.projectPerms?.includes(perm));
