import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import config from '../config/index.js';

const { Schema } = mongoose;

const classSchema = new Schema(
  {
    classId: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    fee: { type: Number, required: true, min: 0 },
    currencyCode: { type: String, default: config.currency.default, uppercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

classSchema.pre('validate', function preValidate(next) {
  if (!this.classId) this.classId = generateFriendlyId('class');
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('end_date_before_start_date'));
  }
  next();
});

classSchema.statics.findByFriendlyId = function findByFriendlyId(classId) {
  return this.findOne({ classId });
};

classSchema.plugin(mongoosePaginate);

export default mongoose.model('Class', classSchema);
