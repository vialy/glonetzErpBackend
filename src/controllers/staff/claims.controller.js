import Joi from 'joi';

import { Claim, Payment } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import {
  ERROR_CODES,
  CLAIM_STATUSES,
  PAYMENT_STATUSES,
} from '../../config/index.js';

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (status) filter.status = status;
  const result = await Claim.paginate(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: { path: 'userId', select: 'userId name email phone' },
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const claim = await Claim.findByFriendlyId(req.params.claimId).populate('userId', 'userId name email phone');
  if (!claim) return fail(res, req.$t('claim_not_found'), ERROR_CODES.CLAIM_NOT_FOUND);
  return ok(res, { claim });
});

const resolveSchema = Joi.object({
  status: Joi.string().valid(CLAIM_STATUSES.SUCCESSFUL, CLAIM_STATUSES.FAILED).required(),
  paymentId: Joi.string().required(),       // friendly id of the underlying payment
  resolutionNote: Joi.string().allow('', null),
});

const resolve = asyncHandler(async (req, res) => {
  const value = await resolveSchema.validateAsync(req.body);
  const claim = await Claim.findByFriendlyId(req.params.claimId);
  if (!claim) return fail(res, req.$t('claim_not_found'), ERROR_CODES.CLAIM_NOT_FOUND);
  if (claim.status !== CLAIM_STATUSES.PENDING) {
    return fail(res, req.$t('claim_already_resolved'), ERROR_CODES.CONFLICT);
  }

  const payment = await Payment.findByFriendlyId(value.paymentId);
  if (!payment) return fail(res, req.$t('payment_not_found'), ERROR_CODES.PAYMENT_NOT_FOUND);

  // Sync the underlying payment's status with the resolution
  const newPaymentStatus = value.status === CLAIM_STATUSES.SUCCESSFUL
    ? PAYMENT_STATUSES.SUCCESSFUL
    : PAYMENT_STATUSES.FAILED;
  payment.status = newPaymentStatus;
  if (newPaymentStatus === PAYMENT_STATUSES.SUCCESSFUL && !payment.settledAt) {
    payment.settledAt = new Date();
  }
  if (newPaymentStatus === PAYMENT_STATUSES.FAILED && !payment.failureReason) {
    payment.failureReason = value.resolutionNote || 'Marked failed by staff after claim review';
  }
  await payment.save();

  claim.status = value.status;
  claim.resolvedPaymentId = payment.paymentId;
  claim.resolvedByStaffId = req.staff._id;
  claim.resolvedAt = new Date();
  claim.resolutionNote = value.resolutionNote;
  await claim.save();

  return ok(res, { claim, payment, message: req.$t('claim_resolved') });
});

export default { list, getOne, resolve };
