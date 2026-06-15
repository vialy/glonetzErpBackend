import Joi from 'joi';

import { User } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { signUserToken } from '../../utils/token.js';
import { ERROR_CODES } from '../../config/index.js';

const loginSchema = Joi.object({
  emailOrPhone: Joi.string().required(),
  password: Joi.string().min(1).required(),
});

const login = asyncHandler(async (req, res) => {
  const value = await loginSchema.validateAsync(req.body);
  const user = await User.findByLogin(value.emailOrPhone);
  if (!user || !user.isActive) {
    return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  }
  const valid = await user.verifyPassword(value.password);
  if (!valid) {
    return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signUserToken({ sub: user._id.toString() });
  return ok(res, {
    token,
    requiresPasswordChange: !user.hsCp,
    user: user.toSafeJSON(),
  });
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required(),
  // New password must be exactly 8 characters to match the generated password
  // length issued on account creation / regeneration.
  newPassword: Joi.string().length(8).required(),
});

const changePassword = asyncHandler(async (req, res) => {
  const value = await changePasswordSchema.validateAsync(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  const valid = await user.verifyPassword(value.currentPassword);
  if (!valid) return fail(res, req.$t('invalid_credentials'), ERROR_CODES.INVALID_CREDENTIALS);
  await user.setPassword(value.newPassword);
  return ok(res, { message: req.$t('password_changed') });
});

export default { login, changePassword };
