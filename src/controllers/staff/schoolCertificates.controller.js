import Joi from 'joi';

import { User, Class, Certificate } from '../../models/index.js';
import SchoolCertificateTemplate from '../../models/SchoolCertificateTemplate.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { readPagination } from '../../utils/pagination.js';
import {
  ERROR_CODES,
  CERTIFICATE_KINDS,
  CERTIFICATE_STATUSES,
  STAFF_ROLES,
} from '../../config/index.js';
import schoolCertificateService from '../../services/schoolCertificate.service.js';

const placementSchema = Joi.object({
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
  width: Joi.number().min(0.04).max(0.5).required(),
  height: Joi.number().min(0.03).max(0.35).required(),
});

const sectionSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  content: Joi.string().required(),
});

const imageDataUrlSchema = Joi.string()
  .pattern(/^data:image\/(png|jpeg|jpg|webp);base64,/i)
  .max(4_000_000)
  .allow(null, '');

const templateUpdateSchema = Joi.object({
  documentTitle: Joi.string().min(1).max(200),
  sections: Joi.array().items(sectionSchema).min(1),
  stampPlacement: placementSchema,
  signaturePlacement: placementSchema,
  stampOffsetXCm: Joi.number().min(-5).max(5),
  stampOffsetYCm: Joi.number().min(-5).max(5),
  signatureOffsetXCm: Joi.number().min(-5).max(5),
  signatureOffsetYCm: Joi.number().min(-5).max(5),
  stampApproved: Joi.boolean(),
  signatureApproved: Joi.boolean(),
  stampImageUrl: imageDataUrlSchema,
  signatureImageUrl: imageDataUrlSchema,
}).min(1);

const updateSchema = Joi.object({
  fullName: Joi.string().min(1).max(120),
  dateOfBirth: Joi.alternatives()
    .try(Joi.date().iso().max('now'), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .allow(null, ''),
  placeOfBirth: Joi.string().max(120).allow(null, ''),
  referenceLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
  courseStartDate: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .allow(null, ''),
  courseEndDate: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .allow(null, ''),
  className: Joi.string().max(120).allow(null, ''),
  timeSlot: Joi.string().valid('MO', 'MI', 'NM', 'AB').allow(null, ''),
  comments: Joi.string().max(500).allow(null, ''),
});

const statusSchema = Joi.object({
  status: Joi.string()
    .valid(CERTIFICATE_STATUSES.BROUILLON, CERTIFICATE_STATUSES.EN_ATTENTE, CERTIFICATE_STATUSES.DISPONIBLE)
    .required(),
});

function parseOptionalDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function canEditCertificate(staff, certificate) {
  if (certificate.status === CERTIFICATE_STATUSES.DISPONIBLE) return false;
  if (staff.role >= STAFF_ROLES.ADMIN) return true;
  return certificate.createdByRole === 'manager';
}

const list = asyncHandler(async (req, res) => {
  const { userId, classId, q } = req.query;
  const { page, limit } = readPagination(req);
  const filter = { certificateKind: CERTIFICATE_KINDS.SCOLARITE };

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
      { path: 'classId', select: 'classId title fee currencyCode' },
    ],
  });

  const certificates = await Promise.all(
    result.docs.map(async (doc) => {
      const userObjectId = doc.userId?._id ?? doc.userId;
      const classDoc = doc.classId?._id ? doc.classId : null;
      const tuitionFullyPaid = await schoolCertificateService.getTuitionFullyPaid(userObjectId, classDoc);
      return {
        ...schoolCertificateService.toPublicCertificate(doc),
        tuitionFullyPaid,
      };
    })
  );

  return ok(res, {
    certificates,
    page: result.page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
    limit: result.limit,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId)
    .populate('userId', 'userId name')
    .populate('classId', 'classId title fee currencyCode');
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }
  return ok(res, { certificate: schoolCertificateService.toPublicCertificate(certificate) });
});

const getTemplate = asyncHandler(async (_req, res) => {
  const template = await SchoolCertificateTemplate.getSingleton();
  return ok(res, { template: schoolCertificateService.toPublicTemplate(template) });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const value = await templateUpdateSchema.validateAsync(req.body, { stripUnknown: true });
  const template = await SchoolCertificateTemplate.getSingleton();

  Object.assign(template, value);
  template.updatedByStaffId = req.staff._id;
  await template.save();

  return ok(res, {
    template: schoolCertificateService.toPublicTemplate(template),
    message: req.$t('school_certificate_template_updated'),
  });
});

const provision = asyncHandler(async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId }).populate('classId');
  if (!user) return fail(res, req.$t('user_not_found'), ERROR_CODES.NOT_FOUND);

  const classDoc = user.classId;
  const certificate = await schoolCertificateService.provisionForUser(user, classDoc, req.staff);

  return ok(res, {
    certificate: schoolCertificateService.toPublicCertificate(certificate),
    message: req.$t('school_certificate_provisioned'),
  });
});

const syncAll = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: { $ne: false } }).populate('classId');
  const certificates = [];
  for (const user of users) {
    const cert = await schoolCertificateService.provisionForUser(user, user.classId, req.staff);
    certificates.push(schoolCertificateService.toPublicCertificate(cert));
  }
  return ok(res, {
    certificates,
    count: certificates.length,
    message: req.$t('school_certificates_synced'),
  });
});

const update = asyncHandler(async (req, res) => {
  const value = await updateSchema.validateAsync(req.body);
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }
  if (!canEditCertificate(req.staff, certificate)) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }

  if (value.fullName !== undefined) certificate.fullName = value.fullName;
  if (value.placeOfBirth !== undefined) certificate.placeOfBirth = value.placeOfBirth ?? '';
  if (value.dateOfBirth !== undefined) certificate.dateOfBirth = parseOptionalDate(value.dateOfBirth);
  if (value.referenceLevel !== undefined) certificate.referenceLevel = value.referenceLevel;
  if (value.courseStartDate !== undefined) certificate.courseStartDate = parseOptionalDate(value.courseStartDate);
  if (value.courseEndDate !== undefined) certificate.courseEndDate = parseOptionalDate(value.courseEndDate);
  if (value.className !== undefined) certificate.className = value.className ?? '';
  if (value.timeSlot !== undefined) certificate.timeSlot = value.timeSlot ?? undefined;
  if (value.comments !== undefined) certificate.comments = value.comments ?? '';

  await certificate.save();
  return ok(res, {
    certificate: schoolCertificateService.toPublicCertificate(certificate),
    message: req.$t('school_certificate_updated'),
  });
});

const setStatus = asyncHandler(async (req, res) => {
  const value = await statusSchema.validateAsync(req.body);
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }
  if (!canEditCertificate(req.staff, certificate)) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }

  certificate.status = value.status;
  if (value.status === CERTIFICATE_STATUSES.DISPONIBLE) {
    certificate.issuedAt = certificate.issuedAt ?? new Date();
  }
  await certificate.save();

  return ok(res, {
    certificate: schoolCertificateService.toPublicCertificate(certificate),
    message: req.$t('school_certificate_updated'),
  });
});

const approve = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }

  const now = new Date();
  certificate.status = CERTIFICATE_STATUSES.DISPONIBLE;
  certificate.issuedAt = now;
  certificate.approvedAt = now;
  certificate.approvedByStaffId = req.staff._id;
  certificate.approvedByStaffFriendlyId = req.staff.staffId;
  await certificate.save();

  return ok(res, {
    certificate: schoolCertificateService.toPublicCertificate(certificate),
    message: req.$t('school_certificate_approved'),
  });
});

const revoke = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }

  certificate.status =
    certificate.createdByRole === 'manager'
      ? CERTIFICATE_STATUSES.EN_ATTENTE
      : CERTIFICATE_STATUSES.BROUILLON;
  certificate.issuedAt = undefined;
  certificate.approvedAt = undefined;
  certificate.approvedByStaffId = undefined;
  certificate.approvedByStaffFriendlyId = undefined;
  certificate.signatureSnapshotUrl = undefined;
  await certificate.save();

  return ok(res, {
    certificate: schoolCertificateService.toPublicCertificate(certificate),
    message: req.$t('school_certificate_revoked'),
  });
});

const remove = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }
  if (!canEditCertificate(req.staff, certificate)) {
    return fail(res, req.$t('forbidden'), ERROR_CODES.FORBIDDEN);
  }

  await certificate.deleteOne();
  return ok(res, { message: req.$t('school_certificate_deleted') });
});

const downloadEligibility = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findByFriendlyId(req.params.certificateId);
  if (!certificate || certificate.certificateKind !== CERTIFICATE_KINDS.SCOLARITE) {
    return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);
  }

  const classDoc = certificate.classId ? await Class.findById(certificate.classId) : null;
  const { tuitionFullyPaid, templateReady } = await schoolCertificateService.getDownloadContext(
    certificate.userId,
    classDoc
  );

  const isAdmin = req.staff.role >= STAFF_ROLES.ADMIN;
  let allowed = templateReady;
  let reason = '';

  if (!templateReady) {
    allowed = isAdmin;
    reason = 'school_certificate_template_not_ready';
  } else if (!isAdmin && !tuitionFullyPaid) {
    allowed = false;
    reason = 'school_certificate_tuition_unpaid';
  }

  return ok(res, {
    tuitionFullyPaid,
    templateReady,
    allowed,
    reason: reason ? req.$t(reason) : '',
  });
});

export default {
  list,
  getOne,
  getTemplate,
  updateTemplate,
  provision,
  syncAll,
  update,
  setStatus,
  approve,
  revoke,
  remove,
  downloadEligibility,
};
