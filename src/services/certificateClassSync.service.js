import { CERTIFICATE_KINDS, CERTIFICATE_STATUSES } from '../config/index.js';
import { CLASS_LEVELS } from '../config/classMetadata.js';
import Certificate from '../models/Certificate.js';
import User from '../models/User.js';
import schoolCertificateService from './schoolCertificate.service.js';

/**
 * Propage les métadonnées classe (dates, titre, créneau, niveau) vers les certificats
 * non verrouillés liés à cette classe :
 * - scolarité : apprenants actuellement assignés à la classe ;
 * - formation : attestations brouillon / en attente uniquement.
 */
export async function propagateFromClass(classDoc) {
  if (!classDoc?._id) return { schoolUpdated: 0, formationUpdated: 0 };

  const users = await User.find({ classId: classDoc._id });
  let schoolUpdated = 0;
  for (const user of users) {
    const existing = await Certificate.findSchoolCertificateForUser(user._id);
    if (!existing || !existing.classId?.equals(classDoc._id)) continue;
    await schoolCertificateService.provisionForUser(user, classDoc);
    schoolUpdated += 1;
  }

  const formationPatch = {
    courseStartDate: classDoc.startDate,
    courseEndDate: classDoc.endDate,
    className: classDoc.title,
    timeSlot: classDoc.timeSlot,
  };
  if (classDoc.level && CLASS_LEVELS.includes(classDoc.level)) {
    formationPatch.referenceLevel = classDoc.level;
  }

  const formationResult = await Certificate.updateMany(
    {
      classId: classDoc._id,
      certificateKind: CERTIFICATE_KINDS.FORMATION,
      status: { $in: [CERTIFICATE_STATUSES.BROUILLON, CERTIFICATE_STATUSES.EN_ATTENTE] },
    },
    { $set: formationPatch }
  );

  return {
    schoolUpdated,
    formationUpdated: formationResult.modifiedCount ?? 0,
  };
}

export default { propagateFromClass };
