import express from 'express';
import paymentsController from '../controllers/payments.controller.js';
import { decodeUserToken } from '../middlewares/auth.middleware.js';


const router = express.Router();

router.post('/create', decodeUserToken, paymentsController.createPayment);
router.post('/list', decodeUserToken, paymentsController.getAllPayments);
// router.post('/list-admin', paymentsController.getAllPaymentsByAdmin);
router.get('/detail/:id', decodeUserToken, paymentsController.getPaymentById);

export default router;