import express from 'express';

import staffRoutes from './staff.routes.js';
import userRoutes from './user.routes.js';
import publicRoutes from './public.routes.js';

const router = express.Router();

router.use('/staff', staffRoutes);
router.use('/users', userRoutes);
router.use('/public', publicRoutes);

export default router;
