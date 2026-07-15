import express from 'express';

import staffAuth from '../middlewares/staffAuth.js';
import { adminOnly, managerOrAbove, collaborateurOrAbove, forbidAdmin } from '../middlewares/roleGuard.js';

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
import expenseCategories from '../controllers/staff/expenseCategories.controller.js';
import scholarships from '../controllers/staff/scholarships.controller.js';
import schoolCertificates from '../controllers/staff/schoolCertificates.controller.js';
import formationCertificates from '../controllers/staff/formationCertificates.controller.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

// ----- Public-ish staff routes -----
router.post('/auth/login', auth.login);

// ----- Authenticated staff -----
router.use(staffAuth);
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

// Users — collaborateur peut créer ; suspendre/supprimer réservé aux managers+
router.post('/users', collaborateurOrAbove(), users.create);
router.post('/users/batch', collaborateurOrAbove(), users.bulkCreate);
router.get('/users', users.list);
router.get('/users/:userId', users.getOne);
router.get('/users/:userId/classes', users.classHistory);
router.get('/users/:userId/class-timeline', users.classTimeline);
router.get('/users/:userId/scholarships', scholarships.listForUser);
router.patch('/users/:userId/class', managerOrAbove(), users.reassignClass);
router.patch('/users/:userId', managerOrAbove(), users.update);
router.patch('/users/:userId/disable', managerOrAbove(), users.disable);
router.patch('/users/:userId/enable', managerOrAbove(), users.enable);
router.delete('/users/:userId', managerOrAbove(), users.remove);
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

// Scholarships — grant/revoke admin only; list readable by all staff.
router.post('/scholarships', adminOnly(), scholarships.grant);
router.get('/scholarships', scholarships.list);
router.get('/scholarships/:scholarshipId', scholarships.getOne);
router.patch('/scholarships/:scholarshipId/revoke', adminOnly(), scholarships.revoke);

// Certificats de scolarité
router.get('/school-certificates/template', schoolCertificates.getTemplate);
router.put('/school-certificates/template', adminOnly(), schoolCertificates.updateTemplate);
router.post('/school-certificates/sync', managerOrAbove(), schoolCertificates.syncAll);
router.post('/school-certificates/provision/:userId', managerOrAbove(), schoolCertificates.provision);
router.get('/school-certificates', schoolCertificates.list);
router.get('/school-certificates/:certificateId/download-eligibility', schoolCertificates.downloadEligibility);
router.get('/school-certificates/:certificateId', schoolCertificates.getOne);
router.put('/school-certificates/:certificateId', managerOrAbove(), schoolCertificates.update);
router.patch('/school-certificates/:certificateId/status', managerOrAbove(), schoolCertificates.setStatus);
router.post('/school-certificates/:certificateId/approve', adminOnly(), schoolCertificates.approve);
router.post('/school-certificates/:certificateId/revoke', adminOnly(), schoolCertificates.revoke);
router.delete('/school-certificates/:certificateId', managerOrAbove(), schoolCertificates.remove);

// Attestations de formation
router.get('/certificates/signature', formationCertificates.getSignature);
router.put('/certificates/signature', adminOnly(), formationCertificates.updateSignature);
router.get('/certificates', formationCertificates.list);
router.post('/certificates', managerOrAbove(), formationCertificates.create);
router.get('/certificates/:certificateId/download-eligibility', formationCertificates.downloadEligibility);
router.get('/certificates/:certificateId', formationCertificates.getOne);
router.put('/certificates/:certificateId', managerOrAbove(), formationCertificates.update);
router.patch('/certificates/:certificateId/status', managerOrAbove(), formationCertificates.setStatus);
router.post('/certificates/:certificateId/approve', adminOnly(), formationCertificates.approve);
router.post('/certificates/:certificateId/revoke', adminOnly(), formationCertificates.revoke);
router.delete('/certificates/:certificateId', managerOrAbove(), formationCertificates.remove);

// Claims
router.get('/claims', claims.list);
router.get('/claims/:claimId', claims.getOne);
router.post('/claims/:claimId/resolve', managerOrAbove(), claims.resolve);

// Accounts & transfers
router.get('/accounts/me', accounts.myAccount);
router.get('/accounts/statement', accounts.statement);
router.get('/accounts/totals', adminOnly(), accounts.totals);
router.get('/accounts/neero-balance', adminOnly(), accounts.neeroBalance);
router.get('/accounts', adminOnly(), accounts.listAll);
router.post('/accounts/transfer', accounts.transfer);

// Virtual (book-keeping) accounts — admin only for create/update.
router.post('/accounts/virtual', adminOnly(), accounts.createVirtual);
router.patch('/accounts/virtual/:accountId', adminOnly(), accounts.updateVirtual);

// Manual credit / debit on any company or virtual account — admin only.
router.post('/accounts/:accountId/adjust', adminOnly(), accounts.adjust);

// Statement for a specific company or virtual account — admin only.
router.get('/accounts/:accountId/statement', adminOnly(), accounts.statementByAccount);

// Fetch a single account by friendly id — admin only (mirrors listAll access).
router.get('/accounts/:accountId', adminOnly(), accounts.getOne);

// Withdrawal accounts (mobile money / neero) — managed by non-admin staff.
// The list endpoint is open to admin as well (with an optional ?staffId filter)
// so admins can browse every staff member's accounts from one place.
router.get('/withdrawal-accounts', withdrawals.listWithdrawalAccounts);
router.post('/withdrawal-accounts', forbidAdmin(), withdrawals.addWithdrawalAccount);
router.post('/withdrawal-accounts/verify-neero', forbidAdmin(), withdrawals.verifyNeeroAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/verify', forbidAdmin(), withdrawals.verifyWithdrawalAccount);
router.post('/withdrawal-accounts/:withdrawalAccountId/resend-otp', forbidAdmin(), withdrawals.resendOtp);
router.post('/withdrawal-accounts/:withdrawalAccountId/deactivate', forbidAdmin(), withdrawals.deactivateWithdrawalAccount);

// Admin lists withdrawal accounts of a specific staff before initiating a payout.
router.get('/staff/:staffId/withdrawal-accounts', adminOnly(), withdrawals.listForStaff);

// Initiating a withdrawal is admin-only: company → staff (ledger) → MoMo/Neero (gateway).
router.get('/withdrawals', adminOnly(), withdrawals.listWithdrawals);
router.post('/withdrawals', adminOnly(), withdrawals.initiateWithdrawal);

// Expenses — any staff records spend against their own account; admin sees all.
router.post('/expenses', upload.single('proof'), expenses.create);
router.get('/expenses', expenses.list);
router.get('/expenses/:expenseId', expenses.getOne);

// Expense categories — managers can add custom categories; all staff read the catalog.
router.post('/expense-categories', managerOrAbove(), expenseCategories.create);
router.get('/expense-categories', expenseCategories.list);
router.get('/expense-categories/:expenseCategoryId', expenseCategories.getOne);
router.patch('/expense-categories/:expenseCategoryId', managerOrAbove(), expenseCategories.update);

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
