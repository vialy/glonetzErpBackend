import { ERROR_CODES } from '../config/index.js';

/**
 * Standard response envelope.
 * HTTP status is ALWAYS 200 — the client keys off `success` and `errorCode`.
 *
 *   { success: boolean, data: object|null, errorMsg: string, errorCode: number }
 */

export function ok(res, data = {}) {
  return res.status(200).json({
    success: true,
    data: data === undefined ? null : data,
    errorMsg: '',
    errorCode: ERROR_CODES.OK,
  });
}

export function fail(res, errorMsg, errorCode = ERROR_CODES.GENERIC) {
  return res.status(200).json({
    success: false,
    data: null,
    errorMsg: errorMsg || 'unknown_error',
    errorCode,
  });
}

/**
 * Map a thrown error to (errorCode, errorMsg).
 *
 *   - Joi validation     -> VALIDATION
 *   - Mongo dup-key      -> CONFLICT
 *   - Multer file errors -> VALIDATION
 *   - Business errors with `err.code` (string) -> mapped via knownMap
 *   - Anything else      -> GENERIC, with `err.message` as a fallback string.
 *
 * The `$t` translator is applied when the message is a known i18n key.
 */
function classifyError(err, $t) {
  const t = $t || ((k) => k);

  if (err && err.isJoi) {
    const msg = (err.details && err.details[0] && err.details[0].message) || err.message;
    return { errorCode: ERROR_CODES.VALIDATION, errorMsg: msg };
  }
  if (err && err.code === 11000) {
    return { errorCode: ERROR_CODES.CONFLICT, errorMsg: t('conflict') };
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return { errorCode: ERROR_CODES.VALIDATION, errorMsg: t('validation_error') };
  }
  if (err && err.message === 'unsupported_file_type') {
    return { errorCode: ERROR_CODES.VALIDATION, errorMsg: t('validation_error') };
  }

  if (err && typeof err.code === 'string') {
    const knownMap = {
      insufficient_funds: ERROR_CODES.INSUFFICIENT_FUNDS,
      gateway_unavailable: ERROR_CODES.GATEWAY_UNAVAILABLE,
      gateway_error: ERROR_CODES.GATEWAY_ERROR,
      otp_invalid: ERROR_CODES.OTP_INVALID,
      otp_expired: ERROR_CODES.OTP_EXPIRED,
      user_email_or_phone_required: ERROR_CODES.VALIDATION,
    };
    const codeNum = knownMap[err.code] || ERROR_CODES.GENERIC;
    return { errorCode: codeNum, errorMsg: t(err.code) || err.message || 'error' };
  }

  return {
    errorCode: ERROR_CODES.GENERIC,
    errorMsg: t('generic_error') || (err && err.message) || 'generic_error',
  };
}

/**
 * Wrap an async controller in try/catch.
 *
 *   - The thrown error is logged server-side (never visible to the client as a
 *     stack trace).
 *   - The response is the standard envelope: `success: false`, the resolved
 *     errorMsg (translated when possible), and a mapped errorCode.
 *
 * No crash ever reaches the user — this is the contract.
 */
export function asyncHandler(fn) {
  return async function safeHandler(req, res, next) {
    try {
      return await fn(req, res, next);
    } catch (err) {
      const route = `${req.method} ${req.originalUrl || req.url}`;
      // Log a single concise line plus the stack on a new line for grep-ability.
      // eslint-disable-next-line no-console
      console.error(`[handler-error] ${route} :: ${err && err.message}`);
      // eslint-disable-next-line no-console
      if (err && err.stack) console.error(err.stack);

      const { errorCode, errorMsg } = classifyError(err, req.$t);
      return fail(res, errorMsg, errorCode);
    }
  };
}

export { classifyError };
