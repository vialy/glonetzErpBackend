import express from 'express';
import paymentsRoutes from './payments.routes.js';
import claimsRoutes from './claims.routes.js';
import apiRoutes from './api.routes.js';
import adminRoutes from './admin.routes.js';
import usersRoutes from './users.routes.js';
import { decodeAdminToken, decodeUserToken } from '../middlewares/auth.middleware.js';

const routes = express.Router();

routes.use('/user', usersRoutes);
routes.use('/admin', decodeAdminToken, adminRoutes);
routes.use('/api', apiRoutes);
routes.use('/claim', decodeUserToken, claimsRoutes);
routes.use('/payments', decodeUserToken, paymentsRoutes);
export default routes;
