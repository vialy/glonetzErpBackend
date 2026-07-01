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
import expenses from '../controllers/staff/expenses.controller.js';

const router = express.Router();

// ----- Public-ish staff routes -----
router.post('/auth/login', auth.login);

// ----- Authenticated staff -----
router.use(staffAuth);
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

// Users
router.post('/users', managerOrAbove(), users.create);
router.post('/users/batch', managerOrAbove(), users.bulkCreate);
router.get('/users', users.list);
router.get('/users/:userId', users.getOne);
router.patch('/users/:userId', managerOrAbove(), users.update);
router.patch('/users/:userId/disable', managerOrAbove(), users.disable);
router.patch('/users/:userId/enable', managerOrAbove(), users.enable);
router.post('/users/:userId/regenerate-password', managerOrAbove(), users.regeneratePassword);
router.post('/users/batch-assign-class', managerOrAbove(), users.batchAssignToClass);

// Classes
router.post('/classes', managerOrAbove(), classes.create);
router.get('/classes', classes.list);
router.get('/classes/:classId', classes.getOne);
router.get('/classes/:classId/details', classes.details);
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

// Withdrawal accounts (mobile money / neero) — managed by non-admin staff.
// The list endpoint is open to admin as well (with an optional ?staffId filter)
// so admins can browse every staff member's accounts from one place.
router.get('/withdrawal-accounts', withdrawals.listWithdrawalAccounts);
router.post('/withdrawal-accounts', forbidAdmin(), withdrawals.addWithdrawalAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/verify', forbidAdmin(), withdrawals.verifyWithdrawalAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/resend-otp', forbidAdmin(), withdrawals.resendOtp);

// Admin lists withdrawal accounts of a specific staff before initiating a payout.
router.get('/staff/:staffId/withdrawal-accounts', adminOnly(), withdrawals.listForStaff);

// Initiating a withdrawal is admin-only: company → staff (ledger) → MoMo/Neero (gateway).
router.post('/withdrawals', adminOnly(), withdrawals.initiateWithdrawal);

// Expenses — any staff records spend against their own account; admin sees all.
router.post('/expenses', expenses.create);
router.get('/expenses', expenses.list);
router.get('/expenses/:expenseId', expenses.getOne);

// Staff management — admin only
router.post('/staff', adminOnly(), staffMgmt.create);
router.get('/staff', adminOnly(), staffMgmt.list);
router.get('/staff/:staffId', adminOnly(), staffMgmt.getOne);
router.patch('/staff/:staffId', adminOnly(), staffMgmt.update);
router.post('/staff/:staffId/regenerate-password', adminOnly(), staffMgmt.regeneratePassword);
// Enable / disable any staff — open to all authenticated staff. The
// controller's role-hierarchy guard rejects requests that would target a
// peer or higher role, so support/auditor effectively have no targets.
router.patch('/staff/:staffId/disable', staffMgmt.disable);
router.patch('/staff/:staffId/enable', staffMgmt.enable);

// Settings — admin only
router.get('/settings', adminOnly(), settings.get);
router.patch('/settings', adminOnly(), settings.update);

export default router;
