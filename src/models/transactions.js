import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';



export const transactionStatus = Object.freeze({
  PENDING: 10,
  PROCESSING: 20, 
  SUCCESSFUL: 30,
  FAILED: -30, 
})

export const transactionActions = Object.freeze({
  DEBIT: "DEBIT",
  CREDIT: "CREDIT"
})

export const transactionTypes = Object.freeze({
  PAYMENT: "PAYMENT",
  REFUND: "REFUND",
  WITHDRAWAL: "WITHDRAWAL",
  DEPOSIT: "TRANSFER"
})

const transactionSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'TXN-', true)
    }
  },
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  openingBalance: {
    type: Number,
  },
  closingBalance: {
    type: Number,
  },
  fee: {
    type: Number,
    default: 0,
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
    default: transactionStatus.PENDING,
    enum: Object.values(transactionStatus)
  },
  type: {
    type: String,
    default: transactionTypes.PAYMENT,
    enum: Object.values(transactionTypes)
  },
  action: {
    type: String,
    default: transactionActions.CREDIT,
    enum: Object.values(transactionActions)
  },
  userId: {
    type: String,
    required: true
  },
  senderId: {
    type: String,
  },
  receiverId: {
    type: String,
  },
  accountId: {
    type: String,
    required: true
  },
  serviceId: {
    type: String,
    default: ""
  },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

transactionSchema.index({transactionId: 1, accountId: 1, userId: 1, serviceId: 1 });

transactionSchema.index({transactionId: 1, userId: 1}, { unique: true });

transactionSchema.plugin(mongoosePaginate);

transactionSchema.statics.getTransactionByServiceId = async function(serviceId = null){
  try{
    const transaction = await this.findOne({serviceId});
    if(transaction){
      return {
        success: true,
        data: transaction
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
      message: "An error occurred while fetching the transaction"
    }
  }
}
transactionSchema.statics.getTransactionByTransactionId = async function(transactionId = null){
  try{
    const transaction = await this.findOne({transactionId, isDeleted: false});
    if(transaction){
      return {
        success: true,
        data: transaction
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
      message: "An error occurred while fetching the transaction"
    }
  }
}

transactionSchema.statics.createTransaction = async function(params = {}){
  
  try{
    const transaction = await this.create(params);
    if(transaction){
      return {
        success: true,
        data: transaction
      }
    }
    return {
      success: false,
      message: "An error occurred while creating the transaction"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while creating the transaction"
    }
  }
}

transactionSchema.statics.markAsProcessing = async function(params = {}){
  const { transactionId } = params;
  try{
    const transaction = await this.findOne({transactionId});
    if(transaction){
      transaction.status = transactionStatus.PROCESSING;

      const newTransaction = await transaction.save();

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
      message: "An error occurred while marking the transaction as processing"
    }
  }
}

transactionSchema.statics.markAsFailed = async function(params = {}){
  const { transactionId, errorMessage } = params;
  try{
    console.log("Params herer+++++++++++++++++++++++>>>>>>>>>>>", params)
    const transaction = await this.findOne({transactionId});
    if(transaction){
      transaction.status = transactionStatus.FAILED;
      transaction.errorMessage = errorMessage;
      
      const newTransaction = await transaction.save();

      if(newTransaction){
        return {
          success: true,
          data: newTransaction
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the transaction as failed"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the transaction as failed"
    }
  }
}
transactionSchema.statics.markAsSuccessful = async function(params = {}){
  console.log("Params data here>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", params)
  const { transactionId } = params;
  try{
    const transaction = await this.findOne({transactionId});
    
    if(transaction){

      transaction.status = transactionStatus.SUCCESSFUL;

      const newTransaction = await transaction.save();

      if(newTransaction){
        return {
          success: true,
          data: newTransaction
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the transaction as successful"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the transaction as successful"
    }
  }
}

transactionSchema.statics.getAllTransactions = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, transactionId, status, userId, amount, description, classId } = params;

    const queryParam = {
      isDeleted: false,
      userId,
    }

    if (transactionId) {
      queryParam.transactionId = transactionId;
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
transactionSchema.statics.getAllTransactionsByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, userId, amount, description, status, transactionId, classId } = params;

    const queryParam = {
      isDeleted: false
    }

    if (userId) {
      queryParam.userId = userId;
    }

    if (classId) {
      queryParam.classId = classId;
    }

    if (transactionId) {
      queryParam.transactionId = transactionId;
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


const model = mongoose.model('transaction', transactionSchema);

export default model;
