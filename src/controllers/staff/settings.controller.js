import Joi from 'joi';

import { Setting } from '../../models/index.js';
import { ok, asyncHandler } from '../../utils/response.js';
import { PAYMENT_PROVIDERS } from '../../config/index.js';

const get = asyncHandler(async (_req, res) => {
  const settings = await Setting.getSingleton();
  return ok(res, { settings });
});

const updateSchema = Joi.object({
  activeGateway: Joi.string().valid(...Object.values(PAYMENT_PROVIDERS)),
  notificationEmails: Joi.array().items(Joi.string().email()),
}).min(1);

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const settings = await Setting.getSingleton();
  if (value.activeGateway !== undefined) settings.activeGateway = value.activeGateway;
  if (value.notificationEmails !== undefined) settings.notificationEmails = value.notificationEmails;
  await settings.save();
  return ok(res, { settings, message: req.$t('settings_updated') });
});

export default { get, update };
