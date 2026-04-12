import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';



export const logTypes = Object.freeze({
  PAYMENT: "PAYMENT",
  REFUND: "REFUND",
  WITHDRAWAL: "WITHDRAWAL",
  DEPOSIT: "TRANSFER"
})
export const logTargets = Object.freeze({
  EXTERNAL_API: "EXTERNAL_API",
  INTERNAL_API: "INTERNAL_API",
  ACCOUNTS: "ACCOUNTS",
})

const logSchema = new Schema({
  logId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'LOG-', true)
    }
  },
  description: {
    type: String,
    required: true
  },
  
  type: {
    type: String,
    default: logTypes.PAYMENT,
    enum: Object.values(logTypes)
  },
  target: {
    type: String,
    default: logTargets.INTERNAL_API,
    enum: Object.values(logTargets)
  },
  reference: {
    type: String,
    default: ""
  },
  jsonData: {
    type: String,
    default: ""
  },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

logSchema.index({logId: 1, reference: 1 });

logSchema.plugin(mongoosePaginate);

logSchema.statics.getLogByReference = async function(serviceId = null){
  try{
    const log = await this.findOne({serviceId});
    if(log){
      return {
        success: true,
        data: log
      }
    }
    return {
      success: false,
      message: "Log not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the log"
    }
  }
}
logSchema.statics.getLogByLogId = async function(logId = null){
  try{
    const log = await this.findOne({logId, isDeleted: false});
    if(log){
      return {
        success: true,
        data: log
      }
    }
    return {
      success: false,
      message: "Log not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the log"
    }
  }
}

logSchema.statics.createLog = async function(params = {}){
  
  try{
    params.jsonData = params.jsonData? JSON.stringify(params.jsonData): null;
    const log = await this.create(params);
    if(log){
      return {
        success: true,
        data: log
      }
    }
    return {
      success: false,
      message: "An error occurred while creating the log"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while creating the log"
    }
  }
}

logSchema.statics.getAllLogsByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, userId, amount, description, status, logId } = params;

    const queryParam = {
      isDeleted: false
    }


    if (logId) {
      queryParam.logId = logId;
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


const model = mongoose.model('log', logSchema);

export default model;
