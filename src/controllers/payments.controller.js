import config from "../config/index.js";
import paymentsModel, { paymentStatus } from "../models/payments.js";
import userModel from "../models/users.js"
import classModel from "../models/classes.js";
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";
import { createRequest } from "../utils/tranzak-services.js";

const tranzakStatus = Object.freeze({
  SUCCESS: "SUCCESSFUL",
  FAILED: "FAILED",
  PENDING: "PENDING",
  PENDING: "PAYMENT_IN_PROGRESS"
})

async function updatePaymentAfterCallback(paymentId, providerResponse){
  let response = {
    success: false,
    message: "",
    data: null
  }



  if(providerResponse?.status === tranzakStatus.SUCCESS){
    
    const payment =  await paymentsModel.markAsSuccessful({
      paymentId,
      providerResponse
    })
    if(payment.success){
      response.success = true;
      response.data = payment.data;
      const data = payment.data;
      userModel.updateUser(data.userId, {
        lastPaymentClassName: data.className,
        lastPaymentClassId: data.classId,
        lastPaymentDate: new Date(),
        paymentExpirationDate: data.endDate,
        isPaymentActive: true,
        lastPaymentAmount: data.amount
      })

    }else{
      response.message = payment.message || "Failed to mark payment as successful";
    }
  }

  if(providerResponse?.status === tranzakStatus.FAILED){
    const payment = await paymentsModel.markAsFailed({
      paymentId,
      providerResponse
    })
    if(payment.success){
      response.success = true;
      response.data = payment.data;
    }else{
      response.message = payment.message || "Failed to mark payment as failed";
    }
  }

  return response;

}

const paymentsController = {
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
      
      if(!classInfo.success){
        return apiResponse.failed(res, req.$t('Class not found'), 404);
      }

      const classData = classInfo.data;
      const params = {
        userId,
        phone,
        classId,
        user: userObjectId,
        amount: classData.price,
        className: classData.name,
        duration: classData.paymentValidityDuration,
        startDate: classData.startDate,
        endDate: classData.endDate,
        currencyCode: classData.currencyCode,
        duration: classData.paymentValidityDuration,
        description: `Payment for - ${classData.name}`
      }

      let payment = await paymentsModel.createPayment(params);

      if (payment.success) {

        /**
         * Call Tranzak service to initiate payment
         */

        const pmData = payment.data;

        const paymentData = {
          amount: pmData.amount,
          mobileWalletNumber: pmData.phone,
          mchTransactionRef: pmData.paymentId,
          description: pmData.description,
          currencyCode: pmData.currencyCode,
          callbackUrl: `${config.server.baseUrl}/api/payments/tranzak-callback`
        }

        const tranzakResponse = await createRequest(paymentData);
        console.log("Tranzak response:::::::::::::::", tranzakResponse);
        if(tranzakResponse.success){
          const params = {
            partnerTransactionId: tranzakResponse.data.requestId,
            paymentId: pmData.paymentId,
            providerResponse: tranzakResponse.data
          }
          payment = await paymentsModel.markAsProcessing(params);
        }else{
          payment = await paymentsModel.markAsFailed({ paymentId: pmData.paymentId, errorMessage: "Failed to initiate payment" })
        }
        
        
        return apiResponse.success(res, { payment });

      }
      return apiResponse.failed(res, req.$t('Failed to create payment'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create payment'));
    }
  },
  async onRefreshStatus(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const payment = await paymentsModel.getPaymentByPaymentId(id);
      if (payment.success) {
        const tranzakResponse = await getRequest(payment.data.partnerTransactionId);
        console.log("Tranzak response for status refresh:::::::::::::::", tranzakResponse);
        if(tranzakResponse.success){
          const params = {
            partnerTransactionId: payment.data.partnerTransactionId,
            paymentId: payment.data.paymentId,
            providerResponse: tranzakResponse.data
          }
          payment = await paymentsModel.updatePaymentStatus(params);
        }else{
          payment = await paymentsModel.markAsFailed({ paymentId: payment.data.paymentId, errorMessage: "Failed to fetch payment status" })
        }
        return apiResponse.success(res, payment);
      }
      return apiResponse.failed(res, req.$t('Payment not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch payment by ID'));
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