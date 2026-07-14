import {
  CERTIFICATE_KINDS,
  CERTIFICATE_STATUSES,
  CERTIFICATE_CREATOR_ROLES,
  STAFF_ROLES,
} from '../config/index.js';
import { CLASS_LEVELS } from '../config/classMetadata.js';
import Certificate from '../models/Certificate.js';
import SchoolCertificateTemplate, { DEFAULT_SCHOOL_CERTIFICATE_SECTIONS } from '../models/SchoolCertificateTemplate.js';
import Payment from '../models/Payment.js';

function formatDateIso(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inferLevelFromClass(classDoc) {
  if (classDoc?.level && CLASS_LEVELS.includes(classDoc.level)) return classDoc.level;
  const match = String(classDoc?.title ?? '').toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match ? match[1] : 'A1';
}

function isPeriodEnded(value) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end.getTime() <= Date.now();
}

/** Scolarité terminée : classe désactivée ou date de fin atteinte. */
export function isSchoolPeriodFinished(classDoc) {
  if (!classDoc) return true;
  if (classDoc.isActive === false) return true;
  return isPeriodEnded(classDoc.endDate);
}

export function resolveCreatorRole(staff) {
  return staff?.role >= STAFF_ROLES.ADMIN
    ? CERTIFICATE_CREATOR_ROLES.ADMIN
    : CERTIFICATE_CREATOR_ROLES.MANAGER;
}

export async function nextSchoolReferenceNumber() {
  const year = new Date().getFullYear();
  const prefix = `SCOL-${year}-`;
  const last = await Certificate.findOne({
    referenceNumber: new RegExp(`^${prefix}`),
    certificateKind: CERTIFICATE_KINDS.SCOLARITE,
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

export function toPublicCertificate(doc) {
  const plain = doc?.toObject ? doc.toObject() : doc;
  if (!plain) return null;
  return {
    id: plain.certificateId,
    referenceNumber: plain.referenceNumber,
    certificateKind: plain.certificateKind,
    fullName: plain.fullName,
    dateOfBirth: formatDateIso(plain.dateOfBirth),
    placeOfBirth: plain.placeOfBirth ?? '',
    referenceLevel: plain.referenceLevel,
    courseStartDate: formatDateIso(plain.courseStartDate),
    courseEndDate: formatDateIso(plain.courseEndDate),
    lessonUnits: plain.lessonUnits ?? 0,
    lessonsAttended: plain.lessonsAttended ?? 0,
    courseInfo: plain.courseInfo ?? 'Complete level',
    evaluation: plain.evaluation ?? 'Participant',
    comments: plain.comments ?? '',
    learnerId: plain.userFriendlyId,
    classId: plain.classFriendlyId,
    className: plain.className,
    timeSlot: plain.timeSlot,
    status: plain.status,
    createdByRole: plain.createdByRole,
    createdByStaffId: plain.createdByStaffFriendlyId,
    issuedAt: plain.issuedAt ? new Date(plain.issuedAt).toISOString() : undefined,
    approvedAt: plain.approvedAt ? new Date(plain.approvedAt).toISOString() : undefined,
    approvedByStaffId: plain.approvedByStaffFriendlyId,
    signatureSnapshotUrl: plain.signatureSnapshotUrl,
    createdAt: plain.createdAt ? new Date(plain.createdAt).toISOString() : new Date().toISOString(),
  };
}

export function toPublicTemplate(doc) {
  const plain = doc?.toObject ? doc.toObject() : doc;
  return {
    documentTitle: plain.documentTitle,
    sections: plain.sections?.length ? plain.sections : DEFAULT_SCHOOL_CERTIFICATE_SECTIONS,
    stampPlacement: plain.stampPlacement,
    signaturePlacement: plain.signaturePlacement,
    stampOffsetXCm: plain.stampOffsetXCm ?? 0,
    stampOffsetYCm: plain.stampOffsetYCm ?? 0,
    signatureOffsetXCm: plain.signatureOffsetXCm ?? 0,
    signatureOffsetYCm: plain.signatureOffsetYCm ?? 0,
    stampApproved: Boolean(plain.stampApproved),
    signatureApproved: Boolean(plain.signatureApproved),
    stampImageUrl: plain.stampImageUrl ?? null,
    signatureImageUrl: plain.signatureImageUrl ?? null,
    updatedAt: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : new Date().toISOString(),
  };
}

function sameClassId(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return String(left) === String(right);
}

function buildSchoolCertificatePayload(user, classDoc) {
  return {
    userFriendlyId: user.userId,
    classId: classDoc?._id ?? null,
    classFriendlyId: classDoc?.classId ?? null,
    fullName: user.name,
    dateOfBirth: user.dateOfBirth,
    placeOfBirth: user.placeOfBirth ?? '',
    referenceLevel: inferLevelFromClass(classDoc),
    courseStartDate: classDoc?.startDate ?? null,
    courseEndDate: classDoc?.endDate ?? null,
    className: classDoc?.title ?? null,
    timeSlot: classDoc?.timeSlot ?? null,
  };
}

/**
 * Crée ou met à jour le certificat de scolarité d'un apprenant pour sa classe actuelle.
 * Un seul certificat scolarité par apprenant ; remplacé à chaque changement de classe.
 */
export async function provisionForUser(user, classDoc, staff = null) {
  const existing = await Certificate.findSchoolCertificateForUser(user._id);
  const payload = buildSchoolCertificatePayload(user, classDoc);

  if (existing) {
    const classChanged = !sameClassId(existing.classId, classDoc?._id);
    Object.assign(existing, payload);

    if (classChanged) {
      existing.referenceNumber = await nextSchoolReferenceNumber();
      existing.issuedAt = new Date();
      existing.status = CERTIFICATE_STATUSES.DISPONIBLE;
      if (staff) {
        existing.createdByRole = resolveCreatorRole(staff);
        existing.createdByStaffId = staff._id;
        existing.createdByStaffFriendlyId = staff.staffId;
      }
    }

    await existing.save();
    return existing;
  }

  const referenceNumber = await nextSchoolReferenceNumber();
  const now = new Date();

  const certificate = await Certificate.create({
    referenceNumber,
    certificateKind: CERTIFICATE_KINDS.SCOLARITE,
    userId: user._id,
    ...payload,
    status: CERTIFICATE_STATUSES.DISPONIBLE,
    createdByRole: staff ? resolveCreatorRole(staff) : CERTIFICATE_CREATOR_ROLES.ADMIN,
    createdByStaffId: staff?._id,
    createdByStaffFriendlyId: staff?.staffId,
    issuedAt: now,
  });

  return certificate;
}

export async function getTuitionFullyPaid(userObjectId, classDoc) {
  if (!classDoc) return false;
  const summary = await Payment.classSummary(
    userObjectId,
    classDoc._id,
    classDoc.fee,
    classDoc.currencyCode
  );
  return summary.fullyPaid;
}

export async function getDownloadContext(userObjectId, classDoc) {
  const template = await SchoolCertificateTemplate.getSingleton();
  const tuitionFullyPaid = await getTuitionFullyPaid(userObjectId, classDoc);
  const templateReady = Boolean(template.stampApproved && template.signatureApproved);
  return { tuitionFullyPaid, templateReady };
}

export default {
  provisionForUser,
  nextSchoolReferenceNumber,
  toPublicCertificate,
  toPublicTemplate,
  resolveCreatorRole,
  getTuitionFullyPaid,
  getDownloadContext,
  isSchoolPeriodFinished,
};
