import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';

export const providers = Object.freeze({
  TRANZAK: "TRANZAK"
})


export const paymentStatus = Object.freeze({
  PENDING: 10,
  PROCESSING: 20, 
  SUCCESSFUL: 30,
  FAILED: -30, 
})

const paymentSchema = new Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'P-', true)
    }
  },
  description: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    default: providers.TRANZAK,
    enum: Object.values(providers)
  },
  duration: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currencyCode: {
    type: String,
    default(){
      return "XAF"
    }
  },
 
  isDeleted: {
    type: Boolean,
    default: false
  },
  status: {
    type: Number,
    default: paymentStatus.PENDING,
    enum: Object.values(paymentStatus)
  },
  partnerTransactionId: {
    type: String,
    default(){
      return ""
    }
  },
  userId: {
    type: String,
    required: true
  },
  providerResponse: {
    type: [String]
  },
  errorMessage: {
    type: String
  },
  phone: {
    type: String,
    required: true
  },
  user: {
    type: String,
    required: true,
    ref: 'user'
  },
  classId: {
    type: String,
  },
  paymentTime: {
    type: Date,
  }
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

paymentSchema.index({paymentId: 1, partnerTransactionId: 1, userId: 1, paymentId: 1, classId: 1});

paymentSchema.plugin(mongoosePaginate);

paymentSchema.statics.getPaymentByPaymentId = async function(paymentId = null){
  try{
    const payment = await this.findOne({paymentId, isDeleted: false});
    if(payment){
      return {
        success: true,
        data: payment
      }
    }
    return {
      success: false,
      message: "Payment not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the payment"
    }
  }
}

paymentSchema.statics.createPayment = async function(params = {}){
  delete params.status
  delete params.partnerTransactionId
  try{
    const payment = await this.create(params);
    if(payment){
      return {
        success: true,
        data: payment
      }
    }
    return {
      success: false,
      message: "An error occurred while creating the payment"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while creating the payment"
    }
  }
}

paymentSchema.statics.markAsProcessing = async function(params = {}){
  const { partnerTransactionId, paymentId, providerResponse } = params;
  try{
    const payment = await this.findOne({paymentId});
    if(payment){
      payment.status = paymentStatus.PROCESSING;
      payment.partnerTransactionId = partnerTransactionId? partnerTransactionId: payment.partnerTransactionId;
      if(providerResponse){
        payment.providerResponse.push(JSON.stringify(providerResponse));
      }
      const newPayment = await payment.save();

      if(newPayment){
        return {
          success: true,
          data: newPayment
        };
      }
    }
    return {
      success: false,
      message: "Payment not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the payment as processing"
    }
  }
}

paymentSchema.statics.markAsFailed = async function(params = {}){
  const { paymentId, providerResponse, errorMessage } = params;
  try{
    console.log("Params herer+++++++++++++++++++++++>>>>>>>>>>>", params)
    const payment = await this.findOne({paymentId});
    if(payment){
      payment.status = paymentStatus.FAILED;
      if(providerResponse){
        payment.providerResponse.push(JSON.stringify(providerResponse));
      }
      payment.errorMessage = errorMessage;
      
      const newPayment = await payment.save();

      if(newPayment){
        return {
          success: true,
          data: newPayment
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the payment as failed"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the payment as failed"
    }
  }
}
paymentSchema.statics.markAsSuccessful = async function(params = {}){
  console.log("Params data here>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", params)
  const { paymentId, providerResponse } = params;
  try{
    const payment = await this.findOne({paymentId});
    
    if(payment){

      payment.status = paymentStatus.SUCCESSFUL;
      if(providerResponse){
        payment.providerResponse.push(JSON.stringify(providerResponse));
      }

      const newPayment = await payment.save();

      if(newPayment){
        return {
          success: true,
          data: newPayment
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the payment as successful"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the payment as successful"
    }
  }
}

paymentSchema.statics.getAllPayments = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, paymentId, status, userId, amount, description, classId, startDate, endDate } = params;

    const queryParam = {
      isDeleted: false,
      userId,
    }

    if (paymentId) {
      queryParam.paymentId = paymentId;
    }

    if (startDate && endDate) {
      queryParam.createdAt = { $gte: startDate, $lte: endDate };
    }


    if (classId) {
      queryParam.classId = classId;
    }

    
    if (status) {
      queryParam.status = status;
    }

    if (amount) {
      queryParam.amount = amount;
    }

    if (description) {
      queryParam.description = { $regex: `.*${description}.*`, $options: "i" };
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}
paymentSchema.statics.getAllPaymentsByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, userId, amount, description, status, paymentId, classId, startDate, endDate } = params;

    const queryParam = {
      isDeleted: false
    }

    if (userId) {
      queryParam.userId = userId;
    }

    if (startDate && endDate) {
      queryParam.createdAt = { $gte: startDate, $lte: endDate };
    }


    if (classId) {
      queryParam.classId = classId;
    }

    if (paymentId) {
      queryParam.paymentId = paymentId;
    }
    
    if (status) {
      queryParam.status = status;
    }

    if (amount) {
      queryParam.amount = amount;
    }

    if (description) {
      queryParam.description = { $regex: `.*${description}.*`, $options: "i" };
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}


const model = mongoose.model('payment', paymentSchema);

export default model;
