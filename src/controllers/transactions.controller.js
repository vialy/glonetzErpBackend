import config from "../config/index.js";
import transactionsModel, { transactionStatus } from "../models/transactions.js";
import userModel from "../models/users.js"
import classModel from "../models/classes.js";
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";
import { createRequest } from "../utils/tranzak-services.js";

const transactionsController = {
  async createTransaction(req, res) {
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
        duration: classInfo.transactionValidityDuration,
        description: `Transaction for - ${classInfo.name}`
      }

      let transaction = await transactionsModel.createTransaction(params);

      if (transaction.success) {

        /**
         * Call Tranzak service to initiate transaction
         */


        const transactionData = {
          amount: transaction.amount,
          mobileWalletNumber: transaction.phone,
          mchTransactionRef: transaction.transactionId,
          description: transaction.description,
          currencyCode: transaction.currencyCode,
          callbackUrl: `${config.server.baseUrl}/api/transactions/tranzak-callback`
        }

        const tranzakResponse = await createRequest(transactionData);

        if(tranzakResponse.success){
          const params = {
            partnerTransactionId: tranzakResponse.data.requestId,
            transactionId: transaction.transactionId,
            providerResponse: tranzakResponse.data
          }
          transaction = await transactionsModel.markAsProcessing(params);
        }else{
          transaction = await transactionsModel.markAsFailed({ transactionId: transaction.transactionId, errorMessage: "Failed to initiate transaction" })
        }
        
        
        return apiResponse.success(res, { transaction });

      }
      return apiResponse.failed(res, req.$t('Failed to create transaction'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create transaction'));
    }
  },
  async getTransactionById(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const transaction = await transactionsModel.getTransactionByTransactionId(id);
      if (transaction) {
        if(transaction.userId !== userId){
          return apiResponse.failed(res, req.$t('Transaction not found'), 404);
        }
        return apiResponse.success(res, transaction);
      }
      return apiResponse.failed(res, req.$t('Transaction not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch transaction by ID'));
    }
  },
  async getAllTransactions(req, res) {
    try{
      const body = req.body;
      const { userId } = req.userInfo;
      body.userId = userId;
      const transactions = await transactionsModel.getAllTransactions(body);
      if (transactions) {
        return apiResponse.success(res, transactions);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch transactions'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch transactions'));
    }
  },
  async getAllTransactionsByAdmin(req, res) {
    try{
      const body = req.body;
      const transactions = await transactionsModel.getAllTransactionsByAdmin(body);
      if (transactions) {
        return apiResponse.success(res, transactions);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch transactions'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch transactions'));
    }
  },
};

export default transactionsController;Í