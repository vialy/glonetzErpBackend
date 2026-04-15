import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';



export const cashoutStatus = Object.freeze({
  PENDING: 10,
  PROCESSING: 20, 
  SUCCESSFUL: 30,
  FAILED: -30, 
})


export const cashoutTypes = Object.freeze({
  PAYMENT: "PAYMENT",
  REFUND: "REFUND",
  WITHDRAWAL: "WITHDRAWAL",
  DEPOSIT: "TRANSFER"
})

const cashoutSchema = new Schema({
  cashoutId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'CASH_OUT-', true)
    }
  },
  description: {
    type: String,
    default: ""
  },
  destinationAccount: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  fees: {
    type: Number,
    required: true
  },
  fee: {
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
    default: cashoutStatus.PENDING,
    enum: Object.values(cashoutStatus)
  },
  userId: {
    type: String,
    required: true
  },
  accountId: {
    type: String,
    required: true
  },
  transactionId: {
    type: String,
    required: true
  },
  providerResponse: {
    type: String,
    default: ""
  },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

cashoutSchema.index({cashoutId: 1, transactionId: 1, accountId: 1, userId: 1});

cashoutSchema.plugin(mongoosePaginate);

cashoutSchema.statics.getTransactionByTransactionId = async function(cashoutId = null){
  try{
    const cashout = await this.findOne({cashoutId, isDeleted: false});
    if(cashout){
      return {
        success: true,
        data: cashout
      }
    }
    return {
      success: false,
      message: "Transaction not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the cashout"
    }
  }
}

cashoutSchema.statics.createTransaction = async function(params = {}){
  delete params.status
  try{
    const cashout = await this.create(params);
    if(cashout){
      return {
        success: true,
        data: cashout
      }
    }
    return {
      success: false,
      message: "An error occurred while creating the cashout"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while creating the cashout"
    }
  }
}

cashoutSchema.statics.markAsProcessing = async function(params = {}){
  const { partnerTransactionId, cashoutId, providerResponse } = params;
  try{
    const cashout = await this.findOne({cashoutId});
    if(cashout){
      cashout.status = cashoutStatus.PROCESSING;
      cashout.partnerTransactionId = partnerTransactionId? partnerTransactionId: cashout.partnerTransactionId;
      cashout.providerResponse = providerResponse? JSON.stringify(providerResponse): cashout.providerResponse;

      const newTransaction = await cashout.save();

      if(newTransaction){
        return {
          success: true,
          data: newTransaction
        };
      }
    }
    return {
      success: false,
      message: "Transaction not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the cashout as processing"
    }
  }
}

cashoutSchema.statics.markAsFailed = async function(params = {}){
  const { cashoutId, providerResponse, errorMessage } = params;
  try{
    console.log("Params herer+++++++++++++++++++++++>>>>>>>>>>>", params)
    const cashout = await this.findOne({cashoutId});
    if(cashout){
      cashout.status = cashoutStatus.FAILED;
      cashout.providerResponse = JSON.stringify(providerResponse);
      cashout.errorMessage = errorMessage;
      
      const newTransaction = await cashout.save();

      if(newTransaction){
        return {
          success: true,
          data: newTransaction
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the cashout as failed"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the cashout as failed"
    }
  }
}
cashoutSchema.statics.markAsSuccessful = async function(params = {}){
  console.log("Params data here>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", params)
  const { cashoutId, providerResponse } = params;
  try{
    const cashout = await this.findOne({cashoutId});
    
    if(cashout){

      cashout.status = cashoutStatus.SUCCESSFUL;
      cashout.providerResponse = JSON.stringify(providerResponse);

      const newTransaction = await cashout.save();

      if(newTransaction){
        return {
          success: true,
          data: newTransaction
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the cashout as successful"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the cashout as successful"
    }
  }
}

cashoutSchema.statics.getAllTransactions = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, cashoutId, status, userId, amount, description, classId, startDate, endDate } = params;

    const queryParam = {
      isDeleted: false,
      userId,
    }

    if (cashoutId) {
      queryParam.cashoutId = cashoutId;
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
cashoutSchema.statics.getAllTransactionsByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, userId, amount, description, status, cashoutId, classId } = params;

    const queryParam = {
      isDeleted: false
    }

    if (userId) {
      queryParam.userId = userId;
    }

    if (classId) {
      queryParam.classId = classId;
    }

    if (cashoutId) {
      queryParam.cashoutId = cashoutId;
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


const model = mongoose.model('withdrawal', cashoutSchema);

export default model;
