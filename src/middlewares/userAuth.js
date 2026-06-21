import { verifyUserToken, parseAuthHeader } from '../utils/token.js';
import User from '../models/User.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES } from '../config/index.js';

/**
 * Authenticates a regular user request.
 * Attaches `req.user` (the User document, minus password hash).
 *
 * If the user hasn't changed their initial password yet (hsCp === false),
 * we still authenticate them but flag them via `req.requiresPasswordChange`
 * so the controllers can decide whether to allow the endpoint. The user
 * change-password endpoint must be reachable in this state.
 */
export default async function userAuth(req, res, next) {
  const raw = parseAuthHeader(req.headers.authorization);
  if (!raw) {
    return fail(res, req.$t('missing_token'), ERROR_CODES.UNAUTHORIZED);
  }
  let decoded;
  try {
    decoded = verifyUserToken(raw);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return fail(res, req.$t('expired_token'), ERROR_CODES.EXPIRED_TOKEN);
    }
    return fail(res, req.$t('invalid_token'), ERROR_CODES.INVALID_TOKEN);
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    return fail(res, req.$t('unauthorized'), ERROR_CODES.UNAUTHORIZED);
  }
  if (!user.isActive) {
    return fail(res, req.$t('account_disabled'), ERROR_CODES.ACCOUNT_DISABLED);
  }
  req.user = user;
  req.tokenPayload = decoded;
  req.requiresPasswordChange = !user.hsCp;
  return next();
}
