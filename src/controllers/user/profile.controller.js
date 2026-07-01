import { User, Class, ClassEnrollment } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES } from '../../config/index.js';

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('classId');
  return ok(res, { user: user.toSafeJSON(), class: user.classId || null });
});

const myClass = asyncHandler(async (req, res) => {
  if (!req.user.classId) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  const cls = await Class.findById(req.user.classId);
  if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
  return ok(res, { class: cls });
});

/**
 * The user's full class history — every class they've ever been enrolled in.
 * The active row (isActive: true) is the user's current class; older rows
 * are past classes with `leftAt` set to when they were moved.
 */
const myClasses = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await ClassEnrollment.paginate(
    { userId: req.user._id },
    { page, limit, sort: { isActive: -1, joinedAt: -1 } }
  );
  return ok(res, result);
});

export default { me, myClass, myClasses };
