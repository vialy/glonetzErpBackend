import Joi from 'joi';

import { Claim, Payment } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { publicUrlFor } from '../../middlewares/upload.js';
import notifier from '../../services/notification.service.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, NOTIFICATION_EVENTS, PAYMENT_STATUSES } from '../../config/index.js';

// `paymentId` is mandatory — a claim only makes sense for a transaction
// that already exists in our records. The payment must belong to the user
// and must NOT be successful (you don't dispute a settled payment).
//
// `amount` and `currencyCode` are NOT accepted from the client — they are
// snapshotted from the referenced payment so the disputed sum always matches
// the underlying record.
const createSchema = Joi.object({
  paymentId: Joi.string().required(), // friendly id, e.g. PAY-XXXXXXXX
  description: Joi.string().allow('', null),
  paymentDate: Joi.date().required(),
});

const create = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, req.$t('claim_proof_required'), ERROR_CODES.VALIDATION);
  }
  const value = await createSchema.validateAsync(req.body);

  const payment = await Payment.findByFriendlyId(value.paymentId);
  if (!payment || !payment.userId.equals(req.user._id)) {
    return fail(res, req.$t('payment_not_found'), ERROR_CODES.PAYMENT_NOT_FOUND);
  }
  if (payment.status === PAYMENT_STATUSES.SUCCESSFUL) {
    return fail(res, req.$t('claim_payment_already_successful'), ERROR_CODES.VALIDATION);
  }

  const claim = await Claim.create({
    userId: req.user._id,
    userFriendlyId: req.user.userId,
    paymentObjectId: payment._id,
    paymentId: payment.paymentId,
    amount: payment.amount,
    currencyCode: payment.currencyCode,
    description: value.description,
    paymentDate: value.paymentDate,
    proofUrl: publicUrlFor(req.file.filename),
  });

  const learnerLabel = req.user.name?.trim() || req.user.userId;
  const paymentDateLabel = new Date(claim.paymentDate).toLocaleDateString('fr-FR');
  const amountLabel = `${Number(claim.amount).toLocaleString('fr-FR')} ${claim.currencyCode}`;

  notifier.notify(NOTIFICATION_EVENTS.CLAIM_REPORTED, {
    subject: `Nouvelle réclamation — ${claim.claimId}`,
    body: [
      'Un apprenant a soumis une réclamation de paiement.',
      '',
      `Apprenant : ${learnerLabel} (${req.user.userId})`,
      `Réclamation : ${claim.claimId}`,
      `Paiement concerné : ${claim.paymentId}`,
      `Montant : ${amountLabel}`,
      `Date déclarée du paiement : ${paymentDateLabel}`,
      value.description?.trim() ? `Commentaire : ${value.description.trim()}` : null,
      '',
      'Connectez-vous à l’espace staff (section Réclamations) pour valider ou rejeter cette demande.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  return ok(res, { claim, message: req.$t('claim_submitted') });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit } = readPagination(req);
  const result = await Claim.paginate({ userId: req.user._id }, { page, limit, sort: '-createdAt' });
  return ok(res, result);
});

export default { create, list };
