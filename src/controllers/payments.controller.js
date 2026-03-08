import config from "../config/index.js";
import paymentsModel, { paymentStatus } from "../models/payments.js";
import userModel from "../models/users.js"
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";

const paymentsController = {
  async purchaseAirtime(req, res, next) {
    const { body } = req;
    req.body = {
      userId: config.userConfig.defaultAirtimeUserId,
      amount: body.amount,
      phone: body.phone
    }
    next();
  },
  async createPayment(req, res) {
    try{
      const { classId, amount, phone } = req.body;

      const { userId } = req.userInfo;

      console.log('uSERID =======================>', userId)

      if(!userId) {
        return apiResponse.failed(res, req.$t('userId is required'), 400);
      }

      const user = await userModel.getUserByUserId(userId);

      if(!user){
        return apiResponse.failed(res, req.$t('User not available'), 404);
      }

      if(!phone){
        return apiResponse.failed(res, req.$t('Phone number is required'), 404);
      }

      const params = {
        userId,
        phone,
        classId,
        user: user.id,
        routine: user.routine,
        amount: user.amount,
        description: `Purchase - ${user.name}`
      }

      const payment = await paymentsModel.createPayment(params);

      if (payment) {

        /**
         * Authorize for payment
         */

        const path = `/v1/services${config.authService.authRequestCallbackPath}${payment.paymentId}`;

        const paymentData = {
          amount: payment.amount,
          phone: payment.phone,
          description: payment.description,
          callbackUrl: `${config.server.baseUrl}${path}`
        }
        

        try {
          const authResponse = await request.post(config.tranzak.CREATE_REQUEST, paymentData);



          console.log("Data here", authResponse)

          if(authResponse){

            await paymentsModel.updatedForPendingApproval( { paymentId: payment.paymentId, serviceId: authResponse.id});

            return apiResponse.success(res, {challenge: { ...authResponse}, payment});
            
          }
          
        }catch(errr){
          console.log(errr)
        }
        
        return apiResponse.success(res, { payment });

      }
      return apiResponse.failed(res, req.$t('Failed to create payment'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create payment'));
    }
  },
  async getPaymentById(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const payment = await paymentsModel.getPaymentByPaymentId(id);
      if (payment) {
        if(payment.userId !== userId){
          return apiResponse.failed(res, req.$t('Payment not found'), 404);
        }
        return apiResponse.success(res, payment);
      }
      return apiResponse.failed(res, req.$t('Payment not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch payment by ID'));
    }
  },
  async getAllPayments(req, res) {
    try{
      const body = req.body;
      const { userId } = req.userInfo;
      body.userId = userId;
      const payments = await paymentsModel.getAllPayments(body);
      if (payments) {
        return apiResponse.success(res, payments);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch payments'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch payments'));
    }
  },
  async getAllPaymentsByAdmin(req, res) {
    try{
      const body = req.body;
      const payments = await paymentsModel.getAllPaymentsByAdmin(body);
      if (payments) {
        return apiResponse.success(res, payments);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch payments'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch payments'));
    }
  },
};

export default paymentsController;