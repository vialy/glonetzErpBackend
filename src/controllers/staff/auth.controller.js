import Joi from 'joi';

import { Staff } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { signStaffToken } from '../../utils/token.js';
import { ERROR_CODES } from '../../config/index.js';

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(1).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required(),
  // New password must be exactly 8 characters to match the generated password
  // length issued on account creation / regeneration.
  newPassword: Joi.string().length(8).required(),
});

const login = asyncHandler(async (req, res) => {
  const value = await loginSchema.validateAsync(req.body);
  const staff = await Staff.findByEmail(value.email);
  if (!staff || !staff.isActive) {
    return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  }
  const valid = await staff.verifyPassword(value.password);
  if (!valid) {
    return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  }

  staff.lastLoginAt = new Date();
  await staff.save();

  const token = signStaffToken({ sub: staff._id.toString(), role: staff.role });
  return ok(res, {
    token,
    requiresPasswordChange: !staff.hsCp,
    staff: staff.toSafeJSON(),
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const value = await changePasswordSchema.validateAsync(req.body);
  const staff = await Staff.findById(req.staff._id).select('+passwordHash');
  const valid = await staff.verifyPassword(value.currentPassword);
  if (!valid) {
    return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  }
  await staff.setPassword(value.newPassword);
  return ok(res, { message: req.$t('password_changed') });
});

const me = asyncHandler(async (req, res) => {
  return ok(res, { staff: req.staff.toSafeJSON() });
});

export default { login, changePassword, me };
