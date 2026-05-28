// Organization role guard.
import { ORG_ROLE_RANK } from '../config/constants.js';
import { Organization } from '../models/index.js';
import { getOrgRole } from '../services/access.service.js';
import { ApiError } from '../utils/http.js';
import { objectId } from '../utils/helpers.js';

export const requireOrgRole = (minRole) => async (req, res, next) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required');
    const parsed = objectId.safeParse(req.params.orgId);
    if (!parsed.success) throw new ApiError(404, 'Organization not found');

    const role = await getOrgRole(req.user.id, parsed.data);
    if (!role) throw new ApiError(404, 'Organization not found');
    if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK[minRole]) throw new ApiError(403, 'Insufficient role');

    const org = await Organization.findById(parsed.data).lean();
    if (!org) throw new ApiError(404, 'Organization not found');

    req.org = org;
    req.orgRole = role;
    next();
  } catch (err) {
    next(err);
  }
};
