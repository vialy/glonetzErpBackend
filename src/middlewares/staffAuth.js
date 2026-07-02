import { verifyStaffToken, parseAuthHeader } from '../utils/token.js';
import Staff from '../models/Staff.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES } from '../config/index.js';

/**
 * Authenticates a staff request.
 * Attaches `req.staff` (the Staff document, minus password hash).
 */
export default async function staffAuth(req, res, next) {
  const raw = parseAuthHeader(req.headers.authorization);
  if (!raw) {
    return fail(res, req.$t('missing_token'), ERROR_CODES.UNAUTHORIZED);
  }
  let decoded;
  try {
    decoded = verifyStaffToken(raw);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return fail(res, req.$t('expired_token'), ERROR_CODES.EXPIRED_TOKEN);
    }
    return fail(res, req.$t('invalid_token'), ERROR_CODES.INVALID_TOKEN);
  }

  const staff = await Staff.findById(decoded.sub);
  if (!staff) {
    return fail(res, req.$t('unauthorized'), ERROR_CODES.UNAUTHORIZED);
  }
  // Disabled accounts get a distinct code so the frontend can sign the user
  // out and show a clear message instead of a generic "session expired" UX.
  if (!staff.isActive) {
    return fail(res, req.$t('account_disabled'), ERROR_CODES.ACCOUNT_DISABLED);
  }
  req.staff = staff;
  req.tokenPayload = decoded;
  return next();
}
