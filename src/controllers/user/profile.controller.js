import { User, Class } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
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

export default { me, myClass };
