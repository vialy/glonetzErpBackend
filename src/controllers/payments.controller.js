import config from "../config/index.js";
import paymentsModel, { paymentStatus } from "../models/payments.js";
import userModel from "../models/users.js"
import classModel from "../models/classes.js";
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";
import { createRequest } from "../utils/tranzak-services.js";

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
      const { classId, phone } = req.body;

      const { userId, _id: userObjectId } = req.userInfo;

      
      if(!classId) {
        return apiResponse.failed(res, req.$t('Class is required'), 400);
      }
      
      if(!classId) {
        return apiResponse.failed(res, req.$t('Class is required'), 400);
      }

      const classInfo = await classModel.getClassByClassId(classId);
      
      if(!classInfo){
        return apiResponse.failed(res, req.$t('Class not found'), 404);
      }

      const params = {
        userId,
        phone,
        classId,
        user: userObjectId,
        amount: classInfo.price,
        currencyCode: classInfo.currencyCode,
        duration: classInfo.paymentValidityDuration,
        description: `Payment for - ${classInfo.name}`
      }

      let payment = await paymentsModel.createPayment(params);

      if (payment.success) {

        /**
         * Call Tranzak service to initiate payment
         */


        const paymentData = {
          amount: payment.amount,
          mobileWalletNumber: payment.phone,
          mchTransactionRef: payment.paymentId,
          description: payment.description,
          currencyCode: payment.currencyCode,
          callbackUrl: `${config.server.baseUrl}/api/payments/tranzak-callback`
        }

        const tranzakResponse = await createRequest(paymentData);

        if(tranzakResponse.success){
          const params = {
            partnerTransactionId: tranzakResponse.data.requestId,
            paymentId: payment.paymentId,
            providerResponse: tranzakResponse.data
          }
          payment = await paymentsModel.markAsProcessing(params);
        }else{
          payment = await paymentsModel.markAsFailed({ paymentId: payment.paymentId, errorMessage: "Failed to initiate payment" })
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