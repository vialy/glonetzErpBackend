import mongoose from 'mongoose';

const { Schema } = mongoose;

const formationCertificateTemplateSchema = new Schema(
  {
    signatureImageUrl: { type: String, default: null },
    updatedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

formationCertificateTemplateSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

export default mongoose.model('FormationCertificateTemplate', formationCertificateTemplateSchema);
