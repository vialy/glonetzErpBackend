import express from 'express';

import userAuth from '../middlewares/userAuth.js';
import { upload } from '../middlewares/upload.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES } from '../config/index.js';

import auth from '../controllers/user/auth.controller.js';
import profile from '../controllers/user/profile.controller.js';
import payments from '../controllers/user/payments.controller.js';
import claims from '../controllers/user/claims.controller.js';
import schoolCertificates from '../controllers/user/schoolCertificates.controller.js';
import formationCertificates from '../controllers/user/formationCertificates.controller.js';

const router = express.Router();

router.post('/auth/login', auth.login);

router.use(userAuth);

/**
 * When a user hasn't changed their initial password yet, only the
 * change-password endpoint is reachable. Everything else short-circuits with
 * PASSWORD_CHANGE_REQUIRED so the frontend can force the flow.
 */
function enforcePasswordChange(req, res, next) {
  if (req.requiresPasswordChange) {
    return fail(res, req.$t('password_change_required'), ERROR_CODES.PASSWORD_CHANGE_REQUIRED);
  }
  return next();
}

router.post('/auth/change-password', auth.changePassword);

// Everything below requires the user to have changed their initial password
router.use(enforcePasswordChange);

router.get('/me', profile.me);
router.get('/my-class', profile.myClass);
router.get('/my-classes', profile.myClasses);
router.get('/my-class-timeline', profile.myClassTimeline);

router.get('/payments', payments.list);
router.get('/payments/pending', payments.pending);
router.get('/payments/class-summary', payments.classSummary);
router.get('/payments/class-summary/:classId', payments.classSummary);
router.post('/payments/initiate', payments.initiate);
router.post('/payments/:paymentId/verify', payments.verify);

router.get('/claims', claims.list);
router.post('/claims', upload.single('proof'), claims.create);

router.get('/school-certificates/me', schoolCertificates.mine);
router.get('/school-certificates/template', schoolCertificates.getTemplate);

router.get('/certificates', formationCertificates.list);
router.get('/certificates/me/enrolled-level', formationCertificates.getEnrolledLevel);
router.put('/certificates/me/enrolled-level', formationCertificates.setEnrolledLevel);
router.get('/certificates/me', formationCertificates.mine);
router.get('/certificates/:certificateId', formationCertificates.getOne);

export default router;
