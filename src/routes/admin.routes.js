import express from 'express';
import usersController from '../controllers/users.controller.js'
import claimController from '../controllers/claims.controller.js'
import classController from '../controllers/classes.controller.js'
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
router.post('/users/list', usersController.getAllUsersByAdmin);
router.post('/users/promote', usersController.promoteUsers);

/**
 * Staff users
 */
// router.post('/staff/create', staffController.createUser);
// router.post('/staff/update/:id', staffController.updateUser);
// router.post('/staff/deactivate/:id', staffController.deactivateUser);
// router.post('/staff/activate/:id', staffController.activateUser);
// router.post('/staff/delete/:id', staffController.deleteUser);
// router.post('/staff/list', staffController.getAllUsers);



/**
 * Payment routes
 */
router.post('/payments/list', paymentsController.getAllPaymentsByAdmin);
router.get('/payments/:id', paymentsController.getPaymentById);




/**
 * Claim routes
 */
router.post('/claim/list', claimController.getAllClaimsByAdmin);
router.get('/claim/:id', claimController.getClaimById);
router.post('/claim/fail/:id', claimController.onMarkPaymentAsFailed);
router.post('/claim/process/:id', claimController.onMarkPaymentAsProcessing);
router.post('/claim/success/:id', claimController.onMarkPaymentAsSuccessful);


/**
 * Classes
 */
router.post('/class/create', classController.createClass);
router.get('/class/:id', classController.getClassById);
router.post('/class/list', classController.getAllClassesByAdmin);
router.post('/class/update/:id', classController.onUpdateClass);


export default router;