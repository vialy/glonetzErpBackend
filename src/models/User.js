import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { hash, compare } from '../utils/password.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    userId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true, sparse: true, unique: true },
    phone: { type: String, required: true, trim: true, index: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    hsCp: { type: Boolean, default: false }, // hasChangedPassword
    classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    isActive: { type: Boolean, default: true },
    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('validate', function preValidate(next) {
  if (!this.userId) this.userId = generateFriendlyId('user');
  if (!this.phone) {
    // Mongoose will also flag this via the `required` constraint, but raise
    // the canonical i18n key here for the API error envelope.
    return next(new Error('user_phone_required'));
  }
  next();
});

// ---- Statics ----
userSchema.statics.findByLogin = function findByLogin(emailOrPhone) {
  const value = String(emailOrPhone || '').trim();
  const lower = value.toLowerCase();
  return this.findOne({ $or: [{ email: lower }, { phone: value }] }).select('+passwordHash');
};

userSchema.statics.existsByEmailOrPhone = async function existsByEmailOrPhone({ email, phone }) {
  const or = [];
  if (email) or.push({ email: String(email).toLowerCase().trim() });
  if (phone) or.push({ phone: String(phone).trim() });
  if (or.length === 0) return false;
  const found = await this.findOne({ $or: or }).lean();
  return !!found;
};

userSchema.statics.createWithPassword = async function createWithPassword({
  name,
  email,
  phone,
  plainPassword,
  classId,
  createdByStaffId,
}) {
  const passwordHash = await hash(plainPassword);
  return this.create({
    name,
    email,
    phone,
    passwordHash,
    classId,
    createdByStaffId,
    hsCp: false,
  });
};

userSchema.statics.assignToClass = function assignToClass(userIds, classId) {
  return this.updateMany({ _id: { $in: userIds } }, { $set: { classId } });
};

// ---- Instance ----
userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return compare(plain, this.passwordHash);
};

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await hash(plain);
  this.hsCp = true;
  return this.save();
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

userSchema.plugin(mongoosePaginate);

export default mongoose.model('User', userSchema);
