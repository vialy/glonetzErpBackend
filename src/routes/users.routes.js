import express from 'express';
import usersController from '../controllers/users.controller.js';
import { decodeUserToken } from '../middlewares/auth.middleware.js';

const router = express.Router();



// User routes
// router.post('/list', usersController.getAllUsers);
router.post('/create', usersController.createUser);
router.put('/update/:id', decodeUserToken, usersController.updateUser);
router.get('/detail', decodeUserToken, usersController.getUserByUserByToken);
router.post('/login', usersController.login);
router.post('/change-password', decodeUserToken, usersController.changePassword);
router.post('/delete', decodeUserToken, usersController.deleteUser);

export default router;