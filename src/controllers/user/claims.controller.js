import Joi from 'joi';

import { Claim } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { publicUrlFor } from '../../middlewares/upload.js';
import notifier from '../../services/notification.service.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, NOTIFICATION_EVENTS } from '../../config/index.js';

const createSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  currencyCode: Joi.string().length(3).uppercase().default('XAF'),
  description: Joi.string().allow('', null),
  paymentDate: Joi.date().required(),
});

const create = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, req.$t('claim_proof_required'), ERROR_CODES.VALIDATION);
  }
  const value = await createSchema.validateAsync(req.body);

  const claim = await Claim.create({
    userId: req.user._id,
    userFriendlyId: req.user.userId,
    amount: value.amount,
    currencyCode: value.currencyCode,
    description: value.description,
    paymentDate: value.paymentDate,
    proofUrl: publicUrlFor(req.file.filename),
  });

  notifier.notify(NOTIFICATION_EVENTS.CLAIM_REPORTED, {
    subject: `New claim reported — ${claim.claimId}`,
    body: `User ${req.user.userId} reported a claim for ${claim.amount} ${claim.currencyCode}.`,
    meta: { claimId: claim.claimId, userId: req.user.userId, paymentDate: claim.paymentDate },
  });

  return ok(res, { claim, message: req.$t('claim_submitted') });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await Claim.paginate({ userId: req.user._id }, { page, limit, sort: '-createdAt' });
  return ok(res, result);
});

export default { create, list };
