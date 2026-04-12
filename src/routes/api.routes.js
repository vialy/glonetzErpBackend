import express from 'express';
import apiController from '../controllers/api.controller.js';
import { decodeUserToken } from '../middlewares/auth.middleware.js';


const router = express.Router();

router.post('/tranzak/callback-tx', apiController.onProcessCallbackFromTranzak);

export default router;