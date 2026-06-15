import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { hash, compare } from '../utils/password.js';
import { STAFF_ROLES, STAFF_ROLE_NAMES } from '../config/index.js';

const { Schema } = mongoose;

const staffSchema = new Schema(
  {
    staffId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: Number,
      enum: Object.values(STAFF_ROLES),
      required: true,
      default: STAFF_ROLES.SUPPORT,
    },
    hsCp: { type: Boolean, default: false }, // hasChangedPassword
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

staffSchema.virtual('roleName').get(function getRoleName() {
  return STAFF_ROLE_NAMES[this.role] || 'unknown';
});

staffSchema.pre('validate', function preValidate(next) {
  if (!this.staffId) this.staffId = generateFriendlyId('staff');
  next();
});

// ---- Static methods ----
staffSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
};

staffSchema.statics.createWithPassword = async function createWithPassword({
  name,
  email,
  phone,
  role,
  plainPassword,
}) {
  const passwordHash = await hash(plainPassword);
  return this.create({ name, email, phone, role, passwordHash, hsCp: false });
};

staffSchema.statics.exists = async function staffExists(email) {
  const found = await this.findOne({ email: String(email).toLowerCase().trim() }).lean();
  return !!found;
};

// ---- Instance methods ----
staffSchema.methods.verifyPassword = function verifyPassword(plain) {
  return compare(plain, this.passwordHash);
};

staffSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await hash(plain);
  this.hsCp = true;
  return this.save();
};

// Used when an admin regenerates a staff member's password — forces a fresh
// first-login password change by resetting hsCp to false.
staffSchema.methods.resetPassword = async function resetPassword(plain) {
  this.passwordHash = await hash(plain);
  this.hsCp = false;
  return this.save();
};

staffSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

staffSchema.plugin(mongoosePaginate);

export default mongoose.model('Staff', staffSchema);
