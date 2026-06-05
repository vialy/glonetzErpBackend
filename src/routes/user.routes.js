import express from 'express';

import userAuth from '../middlewares/userAuth.js';
import { upload } from '../middlewares/upload.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES } from '../config/index.js';

import auth from '../controllers/user/auth.controller.js';
import profile from '../controllers/user/profile.controller.js';
import payments from '../controllers/user/payments.controller.js';
import claims from '../controllers/user/claims.controller.js';

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

router.get('/payments', payments.list);
router.get('/payments/pending', payments.pending);
router.get('/payments/class-summary', payments.classSummary);
router.get('/payments/class-summary/:classId', payments.classSummary);
router.post('/payments/initiate', payments.initiate);

router.get('/claims', claims.list);
router.post('/claims', upload.single('proof'), claims.create);

export default router;
