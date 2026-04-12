import config from "../config/index.js";
import paymentsModel, { paymentStatus } from "../models/payments.js";
import transactionModel, { transactionTypes } from "../models/transactions.js"
import accountsModel, { atomicTransactionCreditOrDebit } from "../models/accounts.js";
import logsModel, { logTargets, logTypes } from "../models/log.js";
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";
import { createRequest, getRequest } from "../utils/tranzak-services.js";

const apiController = {
  async onProcessCallbackFromTranzak(req, res) {


    const { resource } = req.body;

    if (resource && resource.requestId) {

      let payment, request, transaction;


      try {
        request = await getRequest(resource.requestId);
      } catch (error) {
        console.error("Error in processing tranzak callback:", error);
      }


      if (request && request.success && request.data) {

        const { status, mchTransactionRef } = request.data;

        try {
          payment = await paymentsModel.getPaymentByPaymentId(mchTransactionRef);
        } catch (error) {
          console.error("Error in processing tranzak callback:", error);
        }

        if (payment && payment.success) {

          if (payment.data.status === paymentStatus.PROCESSING) {

            if (status === "SUCCESS") {

              const { data } = payment;

              try{
                 await paymentsModel.markAsSuccessful({ paymentId: mchTransactionRef, providerResponse: request.data });
              }catch(e){
                console.log(e)
              }

              try {

                const params = {
                  amount: data.amount,
                  userId: config.systemUser.userId,
                  accountId: config.systemUser.accountId,
                  senderId: config.systemUser.platformPayment,
                  receiverId: config.systemUser.userId,
                  description: `Credit for successful payment - ${data.description}`,
                  type: transactionTypes.PAYMENT,
                  serviceId: data.paymentId
                }

                transaction = await atomicTransactionCreditOrDebit(params);

              } catch (error) {

                logsModel.createLog({description: "Failed to credit system account after successful transaction", reference: data.paymentId, type: logTypes.PAYMENT, target: logTargets})

                console.error("Error in processing tranzak callback:", error);
              }

              if(transaction && transaction.success){
                /**
                 * Do anything here
                 */
              }


            } else if (status === "FAILED") {

              await paymentsModel.markAsFailed({ paymentId: mchTransactionRef, errorMessage: "Payment failed at provider" });

            }
          }

        }

      }

    }

    return apiResponse.success(res, { success: true });
  },
};

export default apiController;