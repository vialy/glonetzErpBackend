import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import {
  CERTIFICATE_KINDS,
  CERTIFICATE_STATUSES,
  CERTIFICATE_CREATOR_ROLES,
  CERTIFICATE_LEVELS,
} from '../config/index.js';
import { CLASS_TIME_SLOTS } from '../config/classMetadata.js';

const { Schema } = mongoose;

const certificateSchema = new Schema(
  {
    certificateId: { type: String, unique: true, index: true },
    referenceNumber: { type: String, unique: true, index: true },

    certificateKind: {
      type: String,
      enum: Object.values(CERTIFICATE_KINDS),
      default: CERTIFICATE_KINDS.SCOLARITE,
      index: true,
    },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userFriendlyId: { type: String, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    classFriendlyId: { type: String, index: true },

    fullName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    placeOfBirth: { type: String, trim: true, default: '' },

    referenceLevel: { type: String, enum: CERTIFICATE_LEVELS, uppercase: true, trim: true },
    courseStartDate: { type: Date },
    courseEndDate: { type: Date },

    className: { type: String, trim: true },
    timeSlot: { type: String, enum: CLASS_TIME_SLOTS, uppercase: true, trim: true },

    lessonUnits: { type: Number, min: 0, default: 0 },
    lessonsAttended: { type: Number, min: 0, default: 0 },
    courseInfo: { type: String, trim: true, default: 'Complete level' },
    evaluation: { type: String, trim: true, default: 'Participant' },
    comments: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: Object.values(CERTIFICATE_STATUSES),
      default: CERTIFICATE_STATUSES.DISPONIBLE,
      index: true,
    },

    createdByRole: {
      type: String,
      enum: Object.values(CERTIFICATE_CREATOR_ROLES),
      default: CERTIFICATE_CREATOR_ROLES.ADMIN,
    },
    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    createdByStaffFriendlyId: { type: String },

    issuedAt: { type: Date },
    approvedAt: { type: Date },
    approvedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    approvedByStaffFriendlyId: { type: String },
    signatureSnapshotUrl: { type: String },
  },
  { timestamps: true }
);

certificateSchema.index(
  { userId: 1, certificateKind: 1 },
  { unique: true, partialFilterExpression: { certificateKind: CERTIFICATE_KINDS.SCOLARITE } }
);

certificateSchema.pre('validate', function preValidate(next) {
  if (!this.certificateId) this.certificateId = generateFriendlyId('certificate');
  next();
});

certificateSchema.statics.findByFriendlyId = function findByFriendlyId(certificateId) {
  return this.findOne({ certificateId });
};

certificateSchema.statics.findSchoolCertificateForUser = function findSchoolCertificateForUser(userObjectId) {
  return this.findOne({ userId: userObjectId, certificateKind: CERTIFICATE_KINDS.SCOLARITE });
};

certificateSchema.plugin(mongoosePaginate);

export default mongoose.model('Certificate', certificateSchema);
