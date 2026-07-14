import Joi from 'joi';

import { User, Class, Certificate } from '../../models/index.js';
import FormationCertificateTemplate from '../../models/FormationCertificateTemplate.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import {
  ERROR_CODES,
  CERTIFICATE_KINDS,
  CERTIFICATE_STATUSES,
  CERTIFICATE_CREATOR_ROLES,
  STAFF_ROLES,
} from '../../config/index.js';
import formationCertificateService from '../../services/formationCertificate.service.js';

const dateField = Joi.alternatives()
  .try(Joi.date().iso(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
  .required();

const createSchema = Joi.object({
  fullName: Joi.string().min(1).max(120).required(),
  dateOfBirth: dateField,
  placeOfBirth: Joi.string().min(1).max(120).required(),
  referenceLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required(),
  courseStartDate: dateField,
  courseEndDate: dateField,
  lessonUnits: Joi.number().integer().min(0).required(),
  lessonsAttended: Joi.number().integer().min(0).required(),
  courseInfo: Joi.string().valid(...formationCertificateService.COURSE_INFO_VALUES).required(),
  evaluation: Joi.string().valid(...formationCertificateService.EVALUATION_VALUES).required(),
  comments: Joi.string().max(500).allow(null, ''),
  learnerId: Joi.string().allow(null, ''),
  classId: Joi.string().allow(null, ''),
  className: Joi.string().max(120).allow(null, ''),
});

const updateSchema = Joi.object({
  fullName: Joi.string().min(1).max(120),
  dateOfBirth: dateField,
  placeOfBirth: Joi.string().min(1).max(120),
  referenceLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
  courseStartDate: dateField,
  courseEndDate: dateField,
  lessonUnits: Joi.number().integer().min(0),
  lessonsAttended: Joi.number().integer().min(0),
  courseInfo: Joi.string().valid(...formationCertificateService.COURSE_INFO_VALUES),
  evaluation: Joi.string().valid(...formationCertificateService.EVALUATION_VALUES),
  comments: Joi.string().max(500).allow(null, ''),
  className: Joi.string().max(120).allow(null, ''),
}).min(1);

const statusSchema = Joi.object({
  status: Joi.string()
    .valid(CERTIFICATE_STATUSES.BROUILLON, CERTIFICATE_STATUSES.EN_ATTENTE)
    .required(),
});

const signatureSchema = Joi.object({
  signatureImageUrl: Joi.string()
    .pattern(/^data:image\/(png|jpeg|jpg|webp);base64,/i)
    .max(4_000_000)
    .allow(null, ''),
});

function parseDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function canEditCertificate(staff, certificate) {
  if (certificate.status === CERTIFICATE_STATUSES.DISPONIBLE) return false;
  if (staff.role >= STAFF_ROLES.ADMIN) return true;
  return certificate.createdByRole === CERTIFICATE_CREATOR_ROLES.MANAGER;
}

function canDeleteCertificate(staff, certificate) {
  if (certificate.status === CERTIFICATE_STATUSES.DISPONIBLE) {
    return staff.role >= STAFF_ROLES.ADMIN;
  }
  if (staff.role >= STAFF_ROLES.ADMIN) return true;
  return certificate.createdByRole === CERTIFICATE_CREATOR_ROLES.MANAGER;
}

async function loadFormationCertificate(certificateId) {
  const certificate = await Certificate.findByFriendlyId(certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.FORMATION) return null;
  return certificate;
}

async function resolveLinks(value) {
  let user = null;
  let classDoc = null;
  if (value.learnerId) {
    user = await User.findOne({ userId: value.learnerId });
    if (!user) return { error: 'user_not_found' };
  }
  if (value.classId) {
    classDoc = await Class.findByFriendlyId(value.classId);
    if (!classDoc) return { error: 'class_not_found' };
  }
  return { user, classDoc };
}

function validateLessonCounts(value) {
  if (value.lessonsAttended > value.lessonUnits) return 'lessons_attended_gt_units';
  const start = parseDate(value.courseStartDate);
  const end = parseDate(value.courseEndDate);
  if (start && end && end < start) return 'end_date_before_start_date';
  return null;
}

const list = asyncHandler(async (req, res) => {
  const { userId, classId, status, q } = req.query;
  const { page, limit } = readPagination(req);
  const filter = { certificateKind: CERTIFICATE_KINDS.FORMATION };

  if (userId) {
    const user = await User.findOne({ userId });
    if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);
    filter.userId = user._id;
  }
  if (classId) {
    const cls = await Class.findByFriendlyId(classId);
    if (!cls) return fail(res, req.$t('class_not_found'), ERROR_CODES.NOT_FOUND);
    filter.classId = cls._id;
  }
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { referenceNumber: { $regex: q, $options: 'i' } },
      { userFriendlyId: { $regex: q, $options: 'i' } },
    ];
  }

  const result = await Certificate.paginate(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'userId', select: 'userId name' },
      { path: 'classId', select: 'classId title endDate isActive' },
    ],
  });

  return ok(res, {
    certificates: result.docs.map((doc) => formationCertificateService.toPublicCertificate(doc)),
    page: result.page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
    limit: result.limit,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  const resolved = await formationCertificateService.ensureFormationSignatureSnapshot(certificate);
  return ok(res, { certificate: formationCertificateService.toPublicCertificate(resolved) });
});

const create = asyncHandler(async (req, res) => {
  const value = await createSchema.validateAsync(req.body);
  const lessonError = validateLessonCounts(value);
  if (lessonError) return fail(res, req.$t(lessonError), ERROR_CODES.VALIDATION);

  const links = await resolveLinks(value);
  if (links.error) return fail(res, req.$t(links.error), ERROR_CODES.NOT_FOUND);

  const payload = {
    ...value,
    dateOfBirth: parseDate(value.dateOfBirth),
    courseStartDate: parseDate(value.courseStartDate),
    courseEndDate: parseDate(value.courseEndDate),
    userId: links.user?._id,
    classId: links.classDoc?._id,
  };
  const duplicate = await formationCertificateService.findDuplicate(payload);
  if (duplicate) {
    return fail(res, req.$t('duplicate_certificate'), ERROR_CODES.DUPLICATE_CERTIFICATE);
  }

  const referenceNumber = await formationCertificateService.nextFormationReferenceNumber(value.referenceLevel);
  const certificate = await Certificate.create({
    referenceNumber,
    certificateKind: CERTIFICATE_KINDS.FORMATION,
    userId: links.user?._id,
    userFriendlyId: links.user?.userId,
    classId: links.classDoc?._id,
    classFriendlyId: links.classDoc?.classId,
    fullName: value.fullName.trim(),
    dateOfBirth: payload.dateOfBirth,
    placeOfBirth: value.placeOfBirth.trim(),
    referenceLevel: value.referenceLevel,
    courseStartDate: payload.courseStartDate,
    courseEndDate: payload.courseEndDate,
    lessonUnits: value.lessonUnits,
    lessonsAttended: value.lessonsAttended,
    courseInfo: value.courseInfo,
    evaluation: value.evaluation,
    comments: value.comments?.trim() ?? '',
    className: value.className ?? links.classDoc?.title ?? '',
    status: formationCertificateService.initialStatusForStaff(req.staff),
    createdByRole: formationCertificateService.resolveCreatorRole(req.staff),
    createdByStaffId: req.staff._id,
    createdByStaffFriendlyId: req.staff.staffId,
  });

  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(certificate),
    message: req.$t('formation_certificate_created'),
  });
});

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  if (!canEditCertificate(req.staff, certificate)) {
    return fail(res, req.$t('certificate_locked'), ERROR_CODES.CERTIFICATE_LOCKED);
  }

  const merged = {
    fullName: value.fullName ?? certificate.fullName,
    dateOfBirth: value.dateOfBirth ? parseDate(value.dateOfBirth) : certificate.dateOfBirth,
    referenceLevel: value.referenceLevel ?? certificate.referenceLevel,
    courseStartDate: value.courseStartDate ? parseDate(value.courseStartDate) : certificate.courseStartDate,
    courseEndDate: value.courseEndDate ? parseDate(value.courseEndDate) : certificate.courseEndDate,
    lessonUnits: value.lessonUnits ?? certificate.lessonUnits,
    lessonsAttended: value.lessonsAttended ?? certificate.lessonsAttended,
  };
  const lessonError = validateLessonCounts(merged);
  if (lessonError) return fail(res, req.$t(lessonError), ERROR_CODES.VALIDATION);

  const duplicate = await formationCertificateService.findDuplicate(
    {
      ...merged,
      fullName: merged.fullName,
      userId: certificate.userId,
      classId: certificate.classId,
    },
    certificate.certificateId
  );
  if (duplicate) {
    return fail(res, req.$t('duplicate_certificate'), ERROR_CODES.DUPLICATE_CERTIFICATE);
  }

  if (value.fullName !== undefined) certificate.fullName = value.fullName.trim();
  if (value.placeOfBirth !== undefined) certificate.placeOfBirth = value.placeOfBirth.trim();
  if (value.dateOfBirth !== undefined) certificate.dateOfBirth = parseDate(value.dateOfBirth);
  if (value.referenceLevel !== undefined) certificate.referenceLevel = value.referenceLevel;
  if (value.courseStartDate !== undefined) certificate.courseStartDate = parseDate(value.courseStartDate);
  if (value.courseEndDate !== undefined) certificate.courseEndDate = parseDate(value.courseEndDate);
  if (value.lessonUnits !== undefined) certificate.lessonUnits = value.lessonUnits;
  if (value.lessonsAttended !== undefined) certificate.lessonsAttended = value.lessonsAttended;
  if (value.courseInfo !== undefined) certificate.courseInfo = value.courseInfo;
  if (value.evaluation !== undefined) certificate.evaluation = value.evaluation;
  if (value.comments !== undefined) certificate.comments = value.comments?.trim() ?? '';
  if (value.className !== undefined) certificate.className = value.className ?? '';

  await certificate.save();
  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(certificate),
    message: req.$t('formation_certificate_updated'),
  });
});

const setStatus = asyncHandler(async (req, res) => {
  const value = await statusSchema.validateAsync(req.body);
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  if (!canEditCertificate(req.staff, certificate)) {
    return fail(res, req.$t('certificate_locked'), ERROR_CODES.CERTIFICATE_LOCKED);
  }

  certificate.status = value.status;
  certificate.issuedAt = undefined;
  certificate.approvedAt = undefined;
  certificate.approvedByStaffId = undefined;
  certificate.approvedByStaffFriendlyId = undefined;
  certificate.signatureSnapshotUrl = undefined;
  await certificate.save();

  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(certificate),
    message: req.$t('formation_certificate_updated'),
  });
});

const approve = asyncHandler(async (req, res) => {
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);

  const classDoc = certificate.classId ? await Class.findById(certificate.classId) : null;
  if (!formationCertificateService.isTrainingFinished(classDoc, certificate)) {
    return fail(res, req.$t('formation_training_not_finished'), ERROR_CODES.FORMATION_TRAINING_NOT_FINISHED);
  }

  const template = await FormationCertificateTemplate.getSingleton();
  const now = new Date();
  certificate.status = CERTIFICATE_STATUSES.DISPONIBLE;
  certificate.issuedAt = now;
  certificate.approvedAt = now;
  certificate.approvedByStaffId = req.staff._id;
  certificate.approvedByStaffFriendlyId = req.staff.staffId;
  certificate.signatureSnapshotUrl = template.signatureImageUrl ?? undefined;
  await certificate.save();

  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(certificate),
    message: req.$t('formation_certificate_approved'),
  });
});

const revoke = asyncHandler(async (req, res) => {
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);

  certificate.status =
    certificate.createdByRole === CERTIFICATE_CREATOR_ROLES.MANAGER
      ? CERTIFICATE_STATUSES.EN_ATTENTE
      : CERTIFICATE_STATUSES.BROUILLON;
  certificate.issuedAt = undefined;
  certificate.approvedAt = undefined;
  certificate.approvedByStaffId = undefined;
  certificate.approvedByStaffFriendlyId = undefined;
  certificate.signatureSnapshotUrl = undefined;
  await certificate.save();

  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(certificate),
    message: req.$t('formation_certificate_revoked'),
  });
});

const remove = asyncHandler(async (req, res) => {
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  if (!canDeleteCertificate(req.staff, certificate)) {
    return fail(res, req.$t('certificate_locked'), ERROR_CODES.CERTIFICATE_LOCKED);
  }

  await certificate.deleteOne();
  return ok(res, { message: req.$t('formation_certificate_deleted') });
});

const downloadEligibility = asyncHandler(async (req, res) => {
  const certificate = await loadFormationCertificate(req.params.certificateId);
  if (!certificate) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);

  const classDoc = certificate.classId ? await Class.findById(certificate.classId) : null;
  const trainingFinished = formationCertificateService.isTrainingFinished(classDoc, certificate);
  const allowed = certificate.status === CERTIFICATE_STATUSES.DISPONIBLE;
  let reason = '';
  if (!allowed) {
    reason = trainingFinished
      ? req.$t('formation_certificate_not_available')
      : req.$t('formation_training_not_finished');
  }

  return ok(res, { trainingFinished, allowed, reason });
});

const getSignature = asyncHandler(async (_req, res) => {
  const template = await FormationCertificateTemplate.getSingleton();
  return ok(res, { template: formationCertificateService.toPublicSignatureTemplate(template) });
});

const updateSignature = asyncHandler(async (req, res) => {
  const value = await signatureSchema.validateAsync(req.body, { stripUnknown: true });
  const template = await FormationCertificateTemplate.getSingleton();
  template.signatureImageUrl = value.signatureImageUrl ?? null;
  template.updatedByStaffId = req.staff._id;
  await template.save();
  return ok(res, {
    template: formationCertificateService.toPublicSignatureTemplate(template),
    message: req.$t('formation_certificate_signature_updated'),
  });
});

export default {
  list,
  getOne,
  create,
  update,
  setStatus,
  approve,
  revoke,
  remove,
  downloadEligibility,
  getSignature,
  updateSignature,
};
