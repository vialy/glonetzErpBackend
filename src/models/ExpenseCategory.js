import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';

const { Schema } = mongoose;

const expenseCategorySchema = new Schema(
  {
    expenseCategoryId: { type: String, unique: true, index: true },
    /** Stable key used on Expense.categoryId (e.g. supplies, custom_restauration). */
    categoryKey: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    icon: { type: String, default: 'MoreHorizontal', trim: true },
    isBuiltin: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },
    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

expenseCategorySchema.pre('validate', function preValidate(next) {
  if (!this.expenseCategoryId) this.expenseCategoryId = generateFriendlyId('expenseCategory');
  next();
});

expenseCategorySchema.statics.findByFriendlyId = function findByFriendlyId(expenseCategoryId) {
  return this.findOne({ expenseCategoryId });
};

expenseCategorySchema.statics.findByCategoryKey = function findByCategoryKey(categoryKey) {
  return this.findOne({ categoryKey: String(categoryKey || '').trim() });
};

expenseCategorySchema.plugin(mongoosePaginate);

export default mongoose.model('ExpenseCategory', expenseCategorySchema);
