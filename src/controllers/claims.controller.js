import config from "../config/index.js";
import claimsModel, { claimStatus } from "../models/claims.js";
import apiResponse from "../utils/api.response.js";

const claimsController = {
  async createClaim(req, res) {
    try{
      const { amount, description, proofOfClaim = [] } = req.body;

      const { userId, _id: user } = req.userInfo;

      if(!amount || amount <= 0){
        return apiResponse.failed(res, req.$t('Invalid claim amount'), 400);
      }

      if(!description){
        return apiResponse.failed(res, req.$t('Claim description is required'), 400);
      }
      
      if(!proofOfClaim || !proofOfClaim.length){
        return apiResponse.failed(res, req.$t('Proof of claim is required'), 400);
      }

      const params  = {
        userId,
        user,
        amount,
        description,
        proofOfClaim
      };

      let claim = await claimsModel.createClaim(params);

      if (claim.success) {
        
        return apiResponse.success(res, claim .data);

      }
      return apiResponse.failed(res, req.$t('Failed to create claim'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create claim'));
    }
  },
  async getClaimById(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const claim = await claimsModel.getClaimByClaimId(id);
      if (claim) {
        if(claim.userId !== userId){
          return apiResponse.failed(res, req.$t('Claim not found'), 404);
        }
        return apiResponse.success(res, claim);
      }
      return apiResponse.failed(res, req.$t('Claim not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch claim by ID'));
    }
  },
  async onMarkPaymentAsProcessing(req, res) {
    try{
      const { id:claimId } = req.params;
     
      const claim = await claimsModel.markAsProcessing({claimId});

      if(claim.success){
        return apiResponse.success(res, claim.data);
      }

      return apiResponse.failed(res, req.$t('Claim not updated'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to update claim'));
    }
  },
  async onMarkPaymentAsFailed(req, res) {
    try{
      const { id:claimId } = req.params;

      const { message, paymentId } = req.body;

      const param = {
        claimId,
        paymentId,
        message: message || "Payment failed" 
      }
     
      const claim = await claimsModel.markAsFailed(param);

      if(claim.success){
        return apiResponse.success(res, claim.data);
      }

      return apiResponse.failed(res, req.$t('Claim not updated'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to update claim'));
    }
  },
  async onMarkPaymentAsSuccessful(req, res) {
    try{
      const { id:claimId } = req.params;

      const { message, paymentId, operatorReference, memo } = req.body;

      if(!paymentId){
        return apiResponse.failed(res, req.$t('Payment ID is required'), 400);
      }

      if(!operatorReference){
        return apiResponse.failed(res, req.$t('Operator Reference is required'), 400);
      }

      const param = {
        claimId,
        memo,
        message: message || "Payment successful",
        operatorReference,
        paymentId
      }
     
      const claim = await claimsModel.markAsSuccessful(param);

      if(claim.success){
        return apiResponse.success(res, claim.data);
      }

      return apiResponse.failed(res, req.$t('Claim not updated'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to update claim'));
    }
  },
  async getAllClaims(req, res) {
    try{
      const body = req.body;
      const { userId } = req.userInfo;
      body.userId = userId;
      const claims = await claimsModel.getAllClaims(body);
      if (claims) {
        return apiResponse.success(res, claims);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch claims'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch claims'));
    }
  },
  async getAllClaimsByAdmin(req, res) {
    try{
      const body = req.body;
      const claims = await claimsModel.getAllClaimsByAdmin(body);
      if (claims) {
        return apiResponse.success(res, claims);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch claims'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch claims'));
    }
  },
};

export default claimsController;