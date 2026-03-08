import express from 'express';
import usersController from '../controllers/users.controller.js'
// import staffController from '../controllers/staff.controller.js'
import paymentsController from '../controllers/payments.controller.js'


const router = express.Router();

/**
 * Users
 */

router.post('/users/create', usersController.createUser);
router.post('/users/update/:id', usersController.updateUser);
router.post('/users/deactivate/:id', usersController.deactivateUser);
router.post('/users/activate/:id', usersController.activateUser);
router.post('/users/delete/:id', usersController.deleteUser);
router.post('/users/list', usersController.getAllUsers);

/**
 * Staff users
 */
// router.post('/staff/create', staffController.createUser);
// router.post('/staff/update/:id', staffController.updateUser);
// router.post('/staff/deactivate/:id', staffController.deactivateUser);
// router.post('/staff/activate/:id', staffController.activateUser);
// router.post('/staff/delete/:id', staffController.deleteUser);
// router.post('/staff/list', staffController.getAllUsers);



router.post('/payments/list', paymentsController.getAllPaymentsByAdmin);
router.get('/payments/:id', paymentsController.getPaymentById);


export default router;