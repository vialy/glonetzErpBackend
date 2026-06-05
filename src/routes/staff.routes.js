import express from 'express';

import staffAuth from '../middlewares/staffAuth.js';
import { adminOnly, managerOrAbove, forbidAdmin } from '../middlewares/roleGuard.js';

import auth from '../controllers/staff/auth.controller.js';
import users from '../controllers/staff/users.controller.js';
import classes from '../controllers/staff/classes.controller.js';
import payments from '../controllers/staff/payments.controller.js';
import claims from '../controllers/staff/claims.controller.js';
import accounts from '../controllers/staff/accounts.controller.js';
import withdrawals from '../controllers/staff/withdrawals.controller.js';
import staffMgmt from '../controllers/staff/staff.controller.js';
import settings from '../controllers/staff/settings.controller.js';

const router = express.Router();

// ----- Public-ish staff routes -----
router.post('/auth/login', auth.login);

// ----- Authenticated staff -----
router.use(staffAuth);
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

// Users
router.post('/users', managerOrAbove(), users.create);
router.get('/users', users.list);
router.get('/users/:userId', users.getOne);
router.patch('/users/:userId', managerOrAbove(), users.update);
router.post('/users/batch-assign-class', managerOrAbove(), users.batchAssignToClass);

// Classes
router.post('/classes', managerOrAbove(), classes.create);
router.get('/classes', classes.list);
router.get('/classes/:classId', classes.getOne);
router.patch('/classes/:classId', managerOrAbove(), classes.update);

// Payments
router.get('/payments', payments.list);
router.get('/payments/class-summary', payments.classSummary);
router.get('/payments/:paymentId', payments.getOne);
router.post('/payments/manual', managerOrAbove(), payments.recordManual);

// Claims
router.get('/claims', claims.list);
router.get('/claims/:claimId', claims.getOne);
router.post('/claims/:claimId/resolve', managerOrAbove(), claims.resolve);

// Accounts & transfers
router.get('/accounts/me', accounts.myAccount);
router.get('/accounts/statement', accounts.statement);
router.get('/accounts', adminOnly(), accounts.listAll);
router.post('/accounts/transfer', accounts.transfer);

// Withdrawals (mobile money) — anyone except admin
router.get('/withdrawal-accounts', forbidAdmin(), withdrawals.listWithdrawalAccounts);
router.post('/withdrawal-accounts', forbidAdmin(), withdrawals.addWithdrawalAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/verify', forbidAdmin(), withdrawals.verifyWithdrawalAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/resend-otp', forbidAdmin(), withdrawals.resendOtp);
router.post('/withdrawals', forbidAdmin(), withdrawals.initiateWithdrawal);

// Staff management — admin only
router.post('/staff', adminOnly(), staffMgmt.create);
router.get('/staff', adminOnly(), staffMgmt.list);
router.get('/staff/:staffId', adminOnly(), staffMgmt.getOne);
router.patch('/staff/:staffId', adminOnly(), staffMgmt.update);

// Settings — admin only
router.get('/settings', adminOnly(), settings.get);
router.patch('/settings', adminOnly(), settings.update);

export default router;
