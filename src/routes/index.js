import express from 'express';
import paymentsRoutes from './payments.routes.js';
import adminRoutes from './admin.routes.js';
import usersRoutes from './users.routes.js';

const routes = express.Router();

routes.use('/user', usersRoutes);
routes.use('/admin', adminRoutes);

export default routes;
