import { Class } from '../../models/index.js';
import SchoolCertificateTemplate from '../../models/SchoolCertificateTemplate.js';
import { ok, asyncHandler } from '../../utils/response.js';
import { CERTIFICATE_KINDS, CERTIFICATE_STATUSES } from '../../config/index.js';
import schoolCertificateService from '../../services/schoolCertificate.service.js';

const mine = asyncHandler(async (req, res) => {
  const classDoc = req.user.classId ? await Class.findById(req.user.classId) : null;
  const certificate = await schoolCertificateService.provisionForUser(req.user, classDoc);

  const { tuitionFullyPaid, templateReady } = await schoolCertificateService.getDownloadContext(
    req.user._id,
    classDoc
  );

  const canDownload = templateReady && tuitionFullyPaid && certificate.status === CERTIFICATE_STATUSES.DISPONIBLE;

  return ok(res, {
    certificate:
      certificate.certificateKind === CERTIFICATE_KINDS.SCOLARITE
        ? schoolCertificateService.toPublicCertificate(certificate)
        : null,
    tuitionFullyPaid,
    templateReady,
    canDownload,
  });
});

const getTemplate = asyncHandler(async (_req, res) => {
  const template = await SchoolCertificateTemplate.getSingleton();
  return ok(res, { template: schoolCertificateService.toPublicTemplate(template) });
});

export default { mine, getTemplate };
