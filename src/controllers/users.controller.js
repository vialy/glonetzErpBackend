import config from "../config/index.js";
import usersModel from "../models/users.js";
import apiResponse from "../utils/api.response.js";
import { generatePassword, validateEmail } from "../utils/index.js";

import { sendEmail } from "../utils/email/sendEmail.js";
import { otpEmailTemplate } from "../utils/email/templates.js";

import jsonwebtoken from "jsonwebtoken";

const usersController = {
  async createUser(req, res) {
    const params = req.body;

    // if(!userId) {
    //   return apiResponse.failed(res, req.$t('userId is required'), 400);
    // }

    if(!params.name){
      return apiResponse.failed(res, req.$t('Name is required'));
    }
    if(!params.email){
      return apiResponse.failed(res, req.$t('Email is required'));
    }
    if(!params.phone){
      return apiResponse.failed(res, req.$t('Phone number is required'));
    }
    // if(!params.password){
    //   return apiResponse.failed(res, req.$t('Password is required'));
    // }

    if(!validateEmail(params.email)){
      return apiResponse.failed(res, req.$t('Invalid email address'));
    }

    params.password = generatePassword(14);

    let newUser;

    try{

      newUser = await usersModel.createUser({
        name: params.name,
        phone: params.phone,
        email: params.email,
        password: params.password,
      });
      
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create user'));
    }

    if (newUser && newUser.success) {

      /**
       * Call email service to send welcome email to user
       */
      try{
        const template = otpEmailTemplate({
          name: params.name,
          code: params.password,
        });
  
        const result = await sendEmail({
          to: "user@example.com",
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
      }catch(error){
        console.error("Error sending email:", error);
      }


      return apiResponse.success(res, {user: newUser.data, params: {password: params.password}});

    }

    return apiResponse.failed(res, newUser?.message || req.$t('Failed to create user'));
  },
  async updateUser(req, res) {
    try{
      const { id } = req.params;
      const { name, description, address, avatar } = req.body;

      const params = {
        name,
        description,
        avatar,
        address
      }

      if(!id){
        return apiResponse.failed(res, req.$t('Invalid params'));
      }

      const newUser = await usersModel.updateUser(id, params);

      if (newUser && newUser.success) {

        return apiResponse.success(res, newUser.data);

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to create user'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to create user'));
    }
  },
  async login(req, res) {
    try{
      const { email, password } = req.body;

     

      if(!email || !password){
        return apiResponse.failed(res, req.$t('Invalid params'));
      }

      const newUser = await usersModel.login(email, password);

      if (newUser && newUser.success) {
        const { userId, _id} = newUser.data;
        const token = jsonwebtoken.sign(
          { userId, _id },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );

        return apiResponse.success(res, { user: newUser.data, token });

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to login'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to login'));
    }
  },
  async changePassword(req, res) {
    try{
      const { userId } = req.userInfo;

      const params = {
        password: req.body.password
      }

      const newUser = await usersModel.updateUser(userId, params);

      if (newUser && newUser.success) {

        return apiResponse.success(res, newUser.data);

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to change password'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to change password'));
    }
  },
  async deactivateUser(req, res) {
    try{
      const { id } = req.params;

      const params = {
        isActive: false
      }

      const newUser = await usersModel.updateUser(id, params);

      if (newUser && newUser.success) {

        return apiResponse.success(res, newUser.data);

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to deactivate user'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to deactivate user'));
    }
  },
  async activateUser(req, res) {
    try{
      const { id } = req.params;

      const params = {
        isActive: true
      }

      const newUser = await usersModel.updateUser(id, params);

      if (newUser && newUser.success) {

        return apiResponse.success(res, newUser.data);

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to activate user'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to activate user'));
    }
  },
  async deleteUser(req, res) {
    try{

      const { userId } = req.userInfo;

      const newUser = await usersModel.deleteUser(userId);

      if (newUser && newUser.success) {

        return apiResponse.success(res, newUser.data);

      }

      return apiResponse.failed(res, newUser?.message || req.$t('Failed to delete user'));

    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to delete user'));
    }
  },
  async getUserByUserId(req, res) {
    try{
      const { id } = req.params;
      const user = await usersModel.getUserByUserId(id);
      if (user && user.success) {
        return apiResponse.success(res, user.data);
      }
      return apiResponse.failed(res,  user?.message || req.$t('User not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch user by ID'));
    }
  },
  async getUserByUserByToken(req, res) {
    try{
      const { userId } = req.userInfo;
      const user = await usersModel.getUserByUserId(userId);
      if (user && user.success) {
        return apiResponse.success(res, user.data);
      }
      return apiResponse.failed(res,  user?.message || req.$t('User not found'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch user by ID'));
    }
  },
  async getAllUsersByAdmin(req, res) {
    // if(1<2) throw new BusinessError('Your account balance is sahhh!', {code: 'balance_small', httpCode: 499});
    try{
      const body = req.body;
      const users = await usersModel.getAllUsersByAdmin(body);
      if (users) {
        return apiResponse.success(res, users);
      }
      return apiResponse.failed(res, req.$t('Failed to fetch users'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch users'));
    }
  },
  async promoteUsers(req, res) {
    try{
      const body = req.body;
      const users = await usersModel.promoteMany(body.users, {classId: body.classId});
      if (users.success) {
        return apiResponse.success(res, {message:users.message});
      }
      return apiResponse.failed(res, req.$t('Failed to fetch users'));
    }catch(error){
      console.error("Error in controller:", error);
      return apiResponse.failed(res, req.$t('Failed to fetch users'));
    }
  }
};

export default usersController;