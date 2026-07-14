import {
  CERTIFICATE_KINDS,
  CERTIFICATE_STATUSES,
  CERTIFICATE_CREATOR_ROLES,
} from '../config/index.js';
import Certificate from '../models/Certificate.js';
import FormationCertificateTemplate from '../models/FormationCertificateTemplate.js';
import {
  resolveCreatorRole,
  toPublicCertificate,
} from './schoolCertificate.service.js';

const COURSE_INFO_VALUES = [
  'Complete level',
  'Partially completed level',
  'Course dropped out',
  'No participation',
];

const EVALUATION_VALUES = ['Outstanding', 'Good', 'Satisfactory', 'Participant'];

function isPeriodEnded(value) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end.getTime() <= Date.now();
}

function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isTrainingFinished(classDoc, certificate) {
  if (classDoc) {
    if (classDoc.isActive === false) return true;
    if (isPeriodEnded(classDoc.endDate)) return true;
  }
  return isPeriodEnded(certificate.courseEndDate);
}

export async function nextFormationReferenceNumber(level) {
  const year = new Date().getFullYear();
  const prefix = `GLZ-${year}-${level}-`;
  const last = await Certificate.findOne({
    referenceNumber: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    certificateKind: CERTIFICATE_KINDS.FORMATION,
  })
    .sort({ referenceNumber: -1 })
    .select('referenceNumber');

  let max = 0;
  if (last?.referenceNumber?.startsWith(prefix)) {
    const seq = Number.parseInt(last.referenceNumber.slice(prefix.length), 10);
    if (Number.isFinite(seq)) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function findDuplicate(input, excludeCertificateId = null) {
  if (input.userId && input.classId) {
    const byClass = await Certificate.findOne({
      certificateKind: CERTIFICATE_KINDS.FORMATION,
      userId: input.userId,
      classId: input.classId,
      ...(excludeCertificateId ? { certificateId: { $ne: excludeCertificateId } } : {}),
    });
    if (byClass) return byClass;
  }

  const filter = {
    certificateKind: CERTIFICATE_KINDS.FORMATION,
    referenceLevel: input.referenceLevel,
    dateOfBirth: input.dateOfBirth,
    courseStartDate: { $lte: input.courseEndDate },
    courseEndDate: { $gte: input.courseStartDate },
  };
  if (excludeCertificateId) filter.certificateId = { $ne: excludeCertificateId };

  const target = normalizeName(input.fullName);
  const candidates = await Certificate.find(filter);
  return candidates.find((c) => normalizeName(c.fullName) === target) ?? null;
}

export function initialStatusForStaff(staff) {
  return resolveCreatorRole(staff) === CERTIFICATE_CREATOR_ROLES.MANAGER
    ? CERTIFICATE_STATUSES.EN_ATTENTE
    : CERTIFICATE_STATUSES.BROUILLON;
}

export function toPublicSignatureTemplate(doc) {
  const plain = doc?.toObject ? doc.toObject() : doc;
  return {
    signatureImageUrl: plain.signatureImageUrl ?? null,
    updatedAt: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function toStudentTrainingCertificate(publicCert) {
  if (!publicCert) return null;
  return {
    id: publicCert.id,
    level: publicCert.referenceLevel,
    status: publicCert.status === CERTIFICATE_STATUSES.DISPONIBLE ? 'disponible' : 'en_cours',
    issuedAt: publicCert.issuedAt,
  };
}

/**
 * Garantit qu'une attestation disponible embarque la signature figée (snapshot).
 * Si absente (anciens certificats), copie depuis FormationCertificateTemplate en base.
 */
export async function ensureFormationSignatureSnapshot(certificateDoc) {
  if (!certificateDoc) return certificateDoc;
  if (certificateDoc.certificateKind !== CERTIFICATE_KINDS.FORMATION) return certificateDoc;
  if (certificateDoc.status !== CERTIFICATE_STATUSES.DISPONIBLE) return certificateDoc;
  if (certificateDoc.signatureSnapshotUrl) return certificateDoc;

  const template = await FormationCertificateTemplate.getSingleton();
  if (!template.signatureImageUrl) return certificateDoc;

  certificateDoc.signatureSnapshotUrl = template.signatureImageUrl;
  await certificateDoc.save();
  return certificateDoc;
}

export {
  toPublicCertificate,
  resolveCreatorRole,
  COURSE_INFO_VALUES,
  EVALUATION_VALUES,
};

export default {
  nextFormationReferenceNumber,
  findDuplicate,
  isTrainingFinished,
  initialStatusForStaff,
  toPublicCertificate,
  toPublicSignatureTemplate,
  toStudentTrainingCertificate,
  ensureFormationSignatureSnapshot,
  resolveCreatorRole,
  COURSE_INFO_VALUES,
  EVALUATION_VALUES,
};
