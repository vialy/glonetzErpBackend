import config from '../config/index.js';

/**
 * Read pagination params from req.query.
 *   - pageNum  (default 1, alias: page)
 *   - pageSize (default 10, alias: limit, capped at MAX_PAGE_SIZE)
 *
 * Returns `{ page, limit }` which matches mongoose-paginate-v2's option keys.
 */
export function readPagination(req) {
  const q = (req && req.query) || {};
  const rawPage = q.pageNum ?? q.page;
  const rawSize = q.pageSize ?? q.limit;

  let page = parseInt(rawPage, 10);
  if (!Number.isFinite(page) || page < 1) page = config.pagination.defaultPageNum;

  let limit = parseInt(rawSize, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = config.pagination.defaultPageSize;
  if (limit > config.pagination.maxPageSize) limit = config.pagination.maxPageSize;

  return { page, limit };
}

/**
 * Convenience: shape mongoose-paginate-v2's response into the frontend's
 * preferred keys. Use as `formatPage(await Model.paginate(...))`.
 */
export function formatPage(result) {
  if (!result) return { items: [], pageNum: 1, pageSize: 0, totalPages: 0, totalDocs: 0 };
  return {
    items: result.docs,
    pageNum: result.page,
    pageSize: result.limit,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
  };
}
