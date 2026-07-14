import mongoose from 'mongoose';

const { Schema } = mongoose;

const placementSchema = new Schema(
  {
    x: { type: Number, default: 0.18 },
    y: { type: Number, default: 0.74 },
    width: { type: Number, default: 0.14 },
    height: { type: Number, default: 0.11 },
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

export const DEFAULT_SCHOOL_CERTIFICATE_SECTIONS = [
  {
    id: 'intro',
    title: 'Introduction',
    content:
      'La direction du centre Glonetz certifie par la présente que / Die Leitung Zentrums Glonetz bescheinigt hiermit, dass:',
  },
  {
    id: 'body_fr',
    title: 'Corps (français)',
    content:
      "Est actuellement inscrit(e) et suit des cours au sein de notre centre de langue Glonetz au niveau {{referenceLevel}}, pour la tranche horaire de {{timeSlotCompact}}. Cette attestation confirme la scolarité et la fréquentation régulière du centre à la date indiquée ci-dessus. Ce document est délivré à la demande de l'intéressé(e) et n'a pas la valeur d'un diplôme officiel.",
  },
  {
    id: 'body_de',
    title: 'Corps (allemand)',
    content:
      'Ist aktuell in unserem Sprachzentrum Glonetz eingeschrieben und besucht Kurse auf Niveau {{referenceLevel}} für den Zeitraum von {{timeSlotCompactDe}}. Dieses Zertifikat bestätigt den Schulbesuch und die regelmäßige Teilnahme am Zentrum zum oben angegebenen Datum. Dieses Dokument wird auf Antrag der betreffenden Person ausgestellt und hat nicht den Wert eines offiziellen Diploms.',
  },
  {
    id: 'closing',
    title: 'Formule de clôture',
    content:
      'Cette attestation est établie uniquement pour servir et valoir ce que de droit. / Dieses Zertifikat dient ausschließlich den gesetzlich vorgeschriebenen Zwecken und ist für diese gültig.',
  },
];

const schoolCertificateTemplateSchema = new Schema(
  {
    documentTitle: {
      type: String,
      default: 'ATTESTATION DE PARTICIPATION/TEILNAHMEBESCHEINIGUNG',
      trim: true,
    },
    sections: { type: [sectionSchema], default: () => DEFAULT_SCHOOL_CERTIFICATE_SECTIONS },
    stampPlacement: { type: placementSchema, default: () => ({ x: 0.18, y: 0.74, width: 0.14, height: 0.11 }) },
    signaturePlacement: {
      type: placementSchema,
      default: () => ({ x: 0.52, y: 0.72, width: 0.24, height: 0.09 }),
    },
    stampOffsetXCm: { type: Number, default: 0 },
    stampOffsetYCm: { type: Number, default: 0 },
    signatureOffsetXCm: { type: Number, default: 0 },
    signatureOffsetYCm: { type: Number, default: 0 },
    stampApproved: { type: Boolean, default: false },
    signatureApproved: { type: Boolean, default: false },
    /** Data URL PNG du cachet (partagé admin + apprenants). */
    stampImageUrl: { type: String, default: null },
    /** Data URL PNG de la signature (partagé admin + apprenants). */
    signatureImageUrl: { type: String, default: null },
    updatedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

schoolCertificateTemplateSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

export default mongoose.model('SchoolCertificateTemplate', schoolCertificateTemplateSchema);
