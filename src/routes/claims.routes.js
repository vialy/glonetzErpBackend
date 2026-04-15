import express from 'express';
import claimsController from '../controllers/claims.controller.js';
import { decodeUserToken } from '../middlewares/auth.middleware.js';


const router = express.Router();

router.post('/create', claimsController.createClaim);
router.post('/list', claimsController.getAllClaims);
// router.post('/list-admin', claimsController.getAllClaimsByAdmin);
router.get('/detail/:id', claimsController.getClaimById);

export default router;