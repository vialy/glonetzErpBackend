import { fail } from '../utils/response.js';
import { ERROR_CODES } from '../config/index.js';

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, _next) {
  // Multer file-size and validation errors
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return fail(res, req.$t('validation_error'), ERROR_CODES.VALIDATION);
  }
  if (err && err.message === 'unsupported_file_type') {
    return fail(res, req.$t('validation_error'), ERROR_CODES.VALIDATION);
  }

  // Joi validation
  if (err && err.isJoi) {
    const msg = err.details && err.details.length ? err.details[0].message : err.message;
    return fail(res, msg, ERROR_CODES.VALIDATION);
  }

  // Mongoose duplicate-key
  if (err && err.code === 11000) {
    return fail(res, req.$t('conflict'), ERROR_CODES.CONFLICT);
  }

  // Known business-logic errors thrown with a code
  if (err && typeof err.code === 'string') {
    const knownMap = {
      insufficient_funds: ERROR_CODES.INSUFFICIENT_FUNDS,
      gateway_unavailable: ERROR_CODES.GATEWAY_UNAVAILABLE,
      gateway_error: ERROR_CODES.GATEWAY_ERROR,
      otp_invalid: ERROR_CODES.OTP_INVALID,
      otp_expired: ERROR_CODES.OTP_EXPIRED,
    };
    const codeNum = knownMap[err.code] || ERROR_CODES.GENERIC;
    const tKey = err.code;
    const message = (req.$t && req.$t(tKey)) || err.message || 'error';
    return fail(res, message, codeNum);
  }

  // Fallback
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', err);
  }
  return fail(res, (req.$t && req.$t('generic_error')) || 'generic_error', ERROR_CODES.GENERIC);
}
