import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';

import transactionModel, { transactionStatus } from "./transactions.js";


export const accountTypes = Object.freeze({
  SYSTEM: "SYSTEM",
  STAFF: "STAFF"
})

const accountSchema = new Schema({
  accountId: {
    type: String,
    required: true,
    unique: true,
    default() {
      return generateId(6, 'AC-')
    }
  },
  balance: {
    type: Number,
    default: 0
  },
  currencyCode: {
    type: String,
    default() {
      return "XAF"
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  user: {
    type: String,
    required: true,
    sparse: true, // allows multiple null values
    default: null,
    ref: 'staff'
  },
  userId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    default: accountTypes.STAFF,
    enum: Object.values(accountTypes)
  },
  description: {
    type: String,
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  meta: {
    type: Schema.Types.Mixed,
    default: {
      totalCredits: 0,
      totalDebits: 0,
      lastTransactionDate: null
    }
  }
},
  {
    optimisticConcurrency: true, // enables versioning for concurrency control
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);


accountSchema.index({ accountId: 1, userId: 1 });

accountSchema.plugin(mongoosePaginate);

/**
 * 
 * @param {string} amount - the amount to credit (positive) or debit (negative)
 * @param {string} accountId - the ID of the account to update
 * @param {string} userId - the ID of the user performing the transaction
 * @param {string} serviceId - the ID of the service associated with the transaction (e.g., payment ID)
 * @param {string} description - a description for the transaction
 * @param {string} type - the type of transaction (e.g., "PAYMENT", "REFUND")
 * @returns 
 */
export const atomicTransactionCreditOrDebit = async function (params = { amount: 0, accountId: null, userId: null, serviceId: null, description: null, type: null }) {

  if (!params.accountId || !params.userId || !params.amount || !params.type || !params.action || !params.serviceId || !params.description) {
    return {
      success: false,
      message: "Missing required parameters"
    }
  }

  let transaction;

  let session = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (e) {
    console.log("Failed to start transaction session", e);
    return {
      success: false,
      message: "Failed to start transaction session"
    }
  }


  try {

    const transactionId = generateId(6, 'TXN-', true);

    const meta = {
      lastTransactionDate: new Date(),
      totalCredits: params.amount > 0 ? params.amount : 0,
      totalDebits: params.amount < 0 ? Math.abs(params.amount) : 0
    }

    const account = await this.updateOne({ accountId: params.accountId }, { $set: { 'meta.lastTransactionDate': meta.lastTransactionDate }, $inc: { balance: params.amount, "meta.totalCredits": meta.totalCredits, "meta.totalDebits": meta.totalDebits }, }, { session });
    transaction = await transactionModel.create({
      transactionId: transactionId,
      accountId: params.accountId,
      type: params.type,
      status: transactionStatus.SUCCESSFUL,
      amount: params.amount,
      senderId: params.senderId,
      receiverId: params.receiverId,
      openingBalance: account.balance - params.amount,
      closingBalance: account.balance,
      action: params.amount > 0 ? "CREDIT" : "DEBIT",
      userId: params.userId,
      serviceId: params.serviceId,
      description: params.description
      // other transaction fields
    }, { session });

    await session.commitTransaction();
  } catch (err) {
    console.log(err);
    await session.abortTransaction();
  }

  if (transaction) {
    return {
      success: true,
      data: transaction
    }
  }

  return {
    success: false,
    message: "Transaction failed"
  }
}


accountSchema.statics.createAccount = async function (params = {}) {
  try {
    delete params.createdAt;
    delete params.updatedAt;
    delete params.isDeleted;
    delete params.isActive;
    delete params.balance;
    delete params.currencyCode;

    const model = await this.create(params);
    if (model) {
      return {
        success: true,
        data: model
      }
    }
    return null
  } catch (e) {
    console.log(e);
    return null
  }
}

accountSchema.statics.getAccountByAccountId = async function (accountId = null) {
  try {
    const model = await this.findOne({ accountId, isDeleted: false, isActive: true });
    if (model) {
      return {
        success: true,
        data: model
      }
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the account"
    }
  }
}

accountSchema.statics.creditOrDebitAccount = async function (accountId = null, amount = 0) {
  try {
    const model = await this.findOne({ accountId, isDeleted: false, isActive: true });
    if (model) {
      if (amount < 0 && Number(model.balance) < Math.abs(amount)) {
        return {
          success: false,
          message: "Insufficient balance"
        }
      }
      model.balance = Number(model.balance) + Number(amount);
      model.meta.lastTransactionDate = new Date();
      if (amount > 0) {
        model.meta.totalCredits = Number(model.meta.totalCredits) + Number(amount);
      } else {
        model.meta.totalDebits = Number(model.meta.totalDebits) + Math.abs(Number(amount));
      }
      await model.save();
      return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the account"
    }
  }
}

accountSchema.statics.updateAccountBalance = async function (accountId = null, balance = 0) {
  try {
    const model = await this.findOne({ accountId, isDeleted: false, isActive: true });
    if (model) {
      model.balance = balance;
      await model.save();
      return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the account"
    }
  }
}

accountSchema.statics.deactivateAccount = async function (accountId) {
  try {
    let model = await this.findOne({ accountId, isDeleted: false });
    if (model) {
      model.isActive = false;
      model = await model.save();
      if (model) return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the account"
    }
  }
}

accountSchema.statics.activateAccount = async function (accountId) {
  try {
    let model = await this.findOne({ accountId, isDeleted: false });
    if (model) {
      model.isActive = true;
      model = await model.save();
      if (model) return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the account"
    }
  }
}

accountSchema.statics.updateAccount = async function (accountId, params = {}) {
  try {
    delete params.createdAt;
    delete params.updatedAt;
    delete params.isDeleted;
    let model = await this.findOne({ accountId, isDeleted: false });
    if (model) {
      Object.keys(params).forEach(e => {
        model[e] = params[e];
      })
      model = await model.save();
      if (model) return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while updating the account"
    }
  }
}
accountSchema.statics.deleteAccount = async function (accountId) {
  try {
    let model = await this.findOne({ accountId, isDeleted: false });
    if (model) {
      model.isDeleted = true;
      model = await model.save();
      if (model) return {
        success: true,
        data: model
      };
    }
    return {
      success: false,
      message: "Account not found"
    }
  } catch (e) {
    console.log(e);
    return {
      success: false,
      message: "An error occurred while deleting the account"
    }
  }
}

accountSchema.statics.getAllAccounts = async function (params = {}) {
  try {

    const { pageNum: page = 1, pageSize = 10, description, name, } = params;

    const queryParam = {
      isDeleted: false,
      isActive: true
    }


    if (description) {
      queryParam.$or = [
        { 'description.en': { $regex: `.*${description}.*`, $options: "i" } },
        { 'description.fr': { $regex: `.*${description}.*`, $options: "i" } }
      ];
    }

    if (name) {
      queryParam.$or = [
        { 'name.en': { $regex: `.*${name}.*`, $options: "i" } },
        { 'name.fr': { $regex: `.*${name}.*`, $options: "i" } }
      ];
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  } catch (e) {
    console.log(e);
    return null;
  }
}
accountSchema.statics.getAllAccountsByAdmin = async function (params = {}) {
  try {

    const { pageNum: page = 1, pageSize = 10, description, name, isActive } = params;

    const queryParam = {
      isDeleted: false
    }

    if (isActive) {
      queryParam.isActive = isActive;
    }

    if (description) {
      queryParam.$or = [
        { 'description.en': { $regex: `.*${description}.*`, $options: "i" } },
        { 'description.fr': { $regex: `.*${description}.*`, $options: "i" } }
      ];
    }

    if (name) {
      queryParam.$or = [
        { 'name.en': { $regex: `.*${name}.*`, $options: "i" } },
        { 'name.fr': { $regex: `.*${name}.*`, $options: "i" } }
      ];
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  } catch (e) {
    console.log(e);
    return null;
  }
}


const model = mongoose.model('account', accountSchema);

export default model;
