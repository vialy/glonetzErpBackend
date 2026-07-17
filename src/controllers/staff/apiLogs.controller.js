import { ApiLog } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES } from '../../config/index.js';

/**
 * GET /staff/api-logs
 *
 * Any authenticated staff can browse third-party call logs (30-day
 * retention via TTL). Useful for reconciling failed withdrawals or claims
 * against what actually happened on the gateway side.
 *
 * Filters:
 *   ?provider=neero
 *   ?method=POST
 *   ?status=500          (single) — HTTP status code
 *   ?status=500,502      (multi)
 *   ?minStatus=400       (>=)
 *   ?url=cash-out        (substring, case-insensitive)
 *   ?from=... &to=...    (ISO dates on createdAt)
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const filter = {};
  if (req.query.provider) filter.provider = String(req.query.provider).toLowerCase();
  if (req.query.method) filter.method = String(req.query.method).toUpperCase();

  if (req.query.status) {
    const parts = String(req.query.status)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (parts.length === 1) filter.responseStatus = parts[0];
    else if (parts.length > 1) filter.responseStatus = { $in: parts };
  }
  if (req.query.minStatus) {
    const min = Number(req.query.minStatus);
    if (Number.isFinite(min)) {
      filter.responseStatus = { ...(filter.responseStatus || {}), $gte: min };
    }
  }
  if (req.query.url) filter.url = { $regex: String(req.query.url), $options: 'i' };

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const result = await ApiLog.paginate(filter, { page, limit, sort: '-createdAt' });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const log = await ApiLog.findByFriendlyId(req.params.apiLogId);
  if (!log) return fail(res, req.$t('api_log_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { apiLog: log });
});

export default { list, getOne };
