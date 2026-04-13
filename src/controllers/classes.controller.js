import config from "../config/index.js";
import classesModel from "../models/classes.js";
import userModel from "../models/users.js"
import apiResponse from "../utils/api.response.js";
import request from "../utils/request.js";
import { createRequest } from "../utils/tranzak-services.js";

const classesController = {
  async createClass(req, res) {
    try{
      const { name, description, startDate, endDate, price } = req.body;

      const { userId } = req.userInfo;

      
      if(!name) {
        return apiResponse.failed(res, req.$t('Class name is required'), 400);
      }
      
      if(!description) {
        return apiResponse.failed(res, req.$t('Class description is required'), 400);
      }
      if(!startDate) {
        return apiResponse.failed(res, req.$t('Class start date is required'), 400);
      }
      if(!endDate) {
        return apiResponse.failed(res, req.$t('Class end date is required'), 400);
      }
      if(!price || price <= 0) {
        return apiResponse.failed(res, req.$t('Invalid class price'), 400);
      }

      const params = {
        createdBy: userId,
        name,
        description,
        startDate,
        endDate,
        price
      }

      let response = await classesModel.createClass(params);

      if (response.success) {
        
        return apiResponse.success(res, response.data);

      }
      return apiResponse.failed(res, req.$t('Failed to create class'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create class'));
    }
  },
  async getClassById(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const response = await classesModel.getClassByClassId(id);
      if (response) {
        if(response.userId !== userId){
          return apiResponse.failed(res, req.$t('Class not found'), 404);
        }
        return apiResponse.success(res, response);
      }
      return apiResponse.failed(res, req.$t('Class not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch class by ID'));
    }
  },
  async onUpdateClass(req, res) {
    try{
      const { id } = req.params;
      const { userId } = req.userInfo;
      const response = await classesModel.updateClass(id, { ...req.body, lastUpdatedBy: userId });
      if (response.success) {
        return apiResponse.success(res, response.data);
      }
      return apiResponse.failed(res, req.$t('Class not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch class by ID'));
    }
  },
  async getAllClasses(req, res) {
    try{
      const body = req.body;
      const { userId } = req.userInfo;
      body.userId = userId;
      const classes = await classesModel.getAllClasses(body);
      if (classes) {
        return apiResponse.success(res, classes);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch classes'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch classes'));
    }
  },
  async getAllClassesByAdmin(req, res) {
    try{
      const body = req.body;
      const classes = await classesModel.getAllClassesByAdmin(body);
      if (classes) {
        return apiResponse.success(res, classes);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch classes'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch classes'));
    }
  },
};

export default classesController;