import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';


export const claimStatus = Object.freeze({
  PENDING: 10,
  PROCESSING: 20, 
  SUCCESSFUL: 30,
  FAILED: -30, 
})

const claimSchema = new Schema({
  claimId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'CLAIM-', true)
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
    default: claimStatus.PENDING,
    enum: Object.values(claimStatus)
  },
  operatorReference: {
    type: String,
    unique: true,
    sparse: true, // allows multiple null values
    default: null
  },
  paymentId: {
    type: String,
    unique: true,
    default: null,
    sparse: true, // allows multiple null values
  },
  userId: {
    type: String,
    required: true
  },
  memo: {
    type: String
  },
  message: {
    type: String
  },
  proofOfClaim: {
    type: [String],
    required: true
  },
  user: {
    type: String,
    required: true,
    ref: 'user'
  },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

claimSchema.index({claimId: 1, operatorReference: 1, paymentId: 1, userId: 1, operatorReference: 1});

claimSchema.plugin(mongoosePaginate);

claimSchema.statics.getClaimByClaimId = async function(claimId = null){
  try{
    const claim = await this.findOne({claimId, isDeleted: false});
    if(claim){
      return {
        success: true,
        data: claim
      }
    }
    return {
      success: false,
      message: "Claim not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the claim"
    }
  }
}

claimSchema.statics.createClaim = async function(params = {}){
  delete params.status
  delete params.operatorReference
  try{
    const claim = await this.create(params);
    if(claim){
      return {
        success: true,
        data: claim
      }
    }
    return {
      success: false,
      message: "An error occurred while creating the claim"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while creating the claim"
    }
  }
}

claimSchema.statics.markAsProcessing = async function(params = {}){
  const { claimId } = params;
  try{
    const claim = await this.findOne({claimId});
    if(claim){
      claim.status = claimStatus.PROCESSING;

      const newClaim = await claim.save();

      if(newClaim){
        return {
          success: true,
          data: newClaim
        };
      }
    }
    return {
      success: false,
      message: "Claim not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the claim as processing"
    }
  }
}

claimSchema.statics.markAsFailed = async function(params = {}){
  const { claimId, message, paymentId } = params;
  try{
    const claim = await this.findOne({claimId});
    if(claim){
      claim.status = claimStatus.FAILED;
      claim.message = message;
      claim.paymentId = paymentId;
      
      const newClaim = await claim.save();

      if(newClaim){
        return {
          success: true,
          data: newClaim
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the claim as failed"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the claim as failed"
    }
  }
}
claimSchema.statics.markAsSuccessful = async function(params = {}){
  console.log("Params data here>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", params)
  const { claimId, providerResponse, paymentId } = params;
  try{
    const claim = await this.findOne({claimId});
    
    if(claim){

      claim.status = claimStatus.SUCCESSFUL;
      claim.paymentId = paymentId;
      claim.operatorReference = providerResponse.operatorReference;

      const newClaim = await claim.save();

      if(newClaim){
        return {
          success: true,
          data: newClaim
        };
      }
    }
    return {
      success: false,
      message: "An error occurred while marking the claim as successful"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while marking the claim as successful"
    }
  }
}

claimSchema.statics.getAllClaims = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, claimId, status, userId, amount, description, operatorReference } = params;

    const queryParam = {
      isDeleted: false,
      userId,
    }

    if (claimId) {
      queryParam.claimId = claimId;
    }

    if (operatorReference) {
      queryParam.operatorReference = operatorReference;
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
claimSchema.statics.getAllClaimsByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, userId, amount, description, status, claimId, operatorReference } = params;

    const queryParam = {
      isDeleted: false
    }

    if (userId) {
      queryParam.userId = userId;
    }

    if (operatorReference) {
      queryParam.operatorReference = operatorReference;
    }

    if (claimId) {
      queryParam.claimId = claimId;
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


const model = mongoose.model('claim', claimSchema);

export default model;
