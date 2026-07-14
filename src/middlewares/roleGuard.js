import { fail } from '../utils/response.js';
import { ERROR_CODES, STAFF_ROLES } from '../config/index.js';

/**
 * Role-based authorization.
 *
 * Usage:
 *   router.post('/users', staffAuth, requireRole(STAFF_ROLES.MANAGER), handler);
 *
 * Roles are numeric (1000 admin, 600 manager, 500 auditor, 200 collaborateur). A
 * request passes if `req.staff.role >= minRole`.
 *
 * Convenience helpers:
 *   adminOnly()             = requireRole(STAFF_ROLES.ADMIN)
 *   managerOrAbove()        = requireRole(STAFF_ROLES.MANAGER)
 *   collaborateurOrAbove()  = requireRole(STAFF_ROLES.COLLABORATEUR)
 */
export function requireRole(minRole) {
  return function roleGuard(req, res, next) {
    if (!req.staff) return fail(res, req.$t('unauthorized'), ERROR_CODES.UNAUTHORIZED);
    if (req.staff.role < minRole) {
      return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
    }
    return next();
  };
}

export function adminOnly() {
  return requireRole(STAFF_ROLES.ADMIN);
}

export function managerOrAbove() {
  return requireRole(STAFF_ROLES.MANAGER);
}

export function collaborateurOrAbove() {
  return requireRole(STAFF_ROLES.COLLABORATEUR);
}

export function forbidAdmin() {
  return function notAdminGuard(req, res, next) {
    if (!req.staff) return fail(res, req.$t('unauthorized'), ERROR_CODES.UNAUTHORIZED);
    if (req.staff.role === STAFF_ROLES.ADMIN) {
      return fail(res, req.$t('admin_cannot_withdraw'), ERROR_CODES.FORBIDDEN);
    }
    return next();
  };
}
