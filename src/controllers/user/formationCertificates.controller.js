import { Class } from '../../models/index.js';
import Certificate from '../../models/Certificate.js';
import { ok, fail, asyncHandler } from '../../utils/response.js';
import { ERROR_CODES } from '../../config/index.js';
import { CERTIFICATE_KINDS, CERTIFICATE_STATUSES, CERTIFICATE_LEVELS } from '../../config/index.js';
import formationCertificateService from '../../services/formationCertificate.service.js';

async function mapStudentCertificates(docs) {
  const certificates = [];
  for (const doc of docs) {
    const resolved = await formationCertificateService.ensureFormationSignatureSnapshot(doc);
    const pub = formationCertificateService.toPublicCertificate(resolved);
    if (pub) certificates.push(pub);
  }
  return certificates;
}

const list = asyncHandler(async (req, res) => {
  const docs = await Certificate.find({
    userId: req.user._id,
    certificateKind: CERTIFICATE_KINDS.FORMATION,
  }).sort('-createdAt');

  return ok(res, { certificates: await mapStudentCertificates(docs) });
});

const mine = asyncHandler(async (req, res) => {
  const docs = await Certificate.find({
    userId: req.user._id,
    certificateKind: CERTIFICATE_KINDS.FORMATION,
    status: CERTIFICATE_STATUSES.DISPONIBLE,
  }).sort('-createdAt');

  return ok(res, { certificates: await mapStudentCertificates(docs) });
});

const getOne = asyncHandler(async (req, res) => {
  const doc = await Certificate.findOne({
    certificateId: req.params.certificateId,
    userId: req.user._id,
    certificateKind: CERTIFICATE_KINDS.FORMATION,
    status: CERTIFICATE_STATUSES.DISPONIBLE,
  });
  if (!doc) return fail(res, req.$t('certificate_not_found'), ERROR_CODES.CERTIFICATE_NOT_FOUND);

  const resolved = await formationCertificateService.ensureFormationSignatureSnapshot(doc);
  return ok(res, {
    certificate: formationCertificateService.toPublicCertificate(resolved),
  });
});

const getEnrolledLevel = asyncHandler(async (req, res) => {
  const classDoc = req.user.classId ? await Class.findById(req.user.classId) : null;
  const level = classDoc?.level && CERTIFICATE_LEVELS.includes(classDoc.level)
    ? classDoc.level
    : 'A1';
  return ok(res, { level });
});

const setEnrolledLevel = asyncHandler(async (_req, res) => {
  return ok(res, { message: 'ok' });
});

export default { list, mine, getOne, getEnrolledLevel, setEnrolledLevel };
