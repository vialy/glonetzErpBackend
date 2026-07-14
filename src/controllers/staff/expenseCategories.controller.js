import Joi from 'joi';

import { ExpenseCategory } from '../../models/index.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import { ERROR_CODES, STAFF_ROLES } from '../../config/index.js';
import { EXPENSE_CATEGORY_ICONS } from '../../config/expenseCategoryMetadata.js';

function slugifyCategoryKey(label) {
  const base = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `custom_${base || 'category'}`;
}

async function buildUniqueCategoryKey(label) {
  const root = slugifyCategoryKey(label);
  let candidate = root;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await ExpenseCategory.findOne({ categoryKey: candidate })) {
    candidate = `${root}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

const createSchema = Joi.object({
  label: Joi.string().min(2).max(120).required(),
  icon: Joi.string().valid(...EXPENSE_CATEGORY_ICONS).default('MoreHorizontal'),
});

const updateSchema = Joi.object({
  label: Joi.string().min(2).max(120),
  icon: Joi.string().valid(...EXPENSE_CATEGORY_ICONS),
  isActive: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0),
}).min(1);

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);
  const normalizedLabel = value.label.trim();

  const duplicate = await ExpenseCategory.findOne({
    label: { $regex: `^${normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (duplicate) {
    return fail(res, req.$t('expense_category_already_exists'), ERROR_CODES.CONFLICT);
  }

  const categoryKey = await buildUniqueCategoryKey(normalizedLabel);
  const doc = await ExpenseCategory.create({
    categoryKey,
    label: normalizedLabel,
    icon: value.icon,
    isBuiltin: false,
    isActive: true,
    sortOrder: 500,
    createdByStaffId: req.staff._id,
  });

  return ok(res, { expenseCategory: doc, message: req.$t('expense_category_created') });
});

const list = asyncHandler(async (req, res) => {
  const { q, isActive } = req.query;
  const { page, limit } = readPagination(req);
  const filter = {};
  if (q) filter.label = { $regex: q, $options: 'i' };
  if (isActive === 'true') filter.isActive = true;
  if (isActive === 'false') filter.isActive = false;
  if (isActive === undefined) filter.isActive = true;

  const result = await ExpenseCategory.paginate(filter, {
    page,
    limit,
    sort: { sortOrder: 1, label: 1 },
  });
  return ok(res, result);
});

const getOne = asyncHandler(async (req, res) => {
  const doc = await ExpenseCategory.findByFriendlyId(req.params.expenseCategoryId);
  if (!doc) return fail(res, req.$t('expense_category_not_found'), ERROR_CODES.EXPENSE_CATEGORY_NOT_FOUND);
  return ok(res, { expenseCategory: doc });
});

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const doc = await ExpenseCategory.findByFriendlyId(req.params.expenseCategoryId);
  if (!doc) return fail(res, req.$t('expense_category_not_found'), ERROR_CODES.EXPENSE_CATEGORY_NOT_FOUND);

  if (doc.isBuiltin && req.staff.role !== STAFF_ROLES.ADMIN) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }

  if (value.label) {
    const normalizedLabel = value.label.trim();
    const duplicate = await ExpenseCategory.findOne({
      _id: { $ne: doc._id },
      label: { $regex: `^${normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (duplicate) {
      return fail(res, req.$t('expense_category_already_exists'), ERROR_CODES.CONFLICT);
    }
    value.label = normalizedLabel;
  }

  Object.assign(doc, value);
  await doc.save();

  return ok(res, { expenseCategory: doc, message: req.$t('expense_category_updated') });
});

export default { create, list, getOne, update };
