import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';
import bcrypt from "bcrypt";

export const USER_STATUS = {
  INACTIVE: 1,
  ACTIVE: 20,
  SUSPENDED: -1
}

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
  },
  address: {
    type: String,
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  currentClass: {
    type: String,
    ref: 'class'
  },
  classId: {
    type: String,
  },
  userId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'GU-', true)
    }
  },
  isPaymentActive: {
    type: Boolean,
    default: false
  },
  lastPaymentDate: {
    type: Date,
  },
  lastPaymentClassId: {
    type: String,
  },
  lastPaymentClassName: {
    type: String,
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: Number,
    default: USER_STATUS.INACTIVE,
    enum: Object.values(USER_STATUS) // 1 = inactive, 20 = active, -1 = suspended
  },
  metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

userSchema.index({provider: 1, durationType: 1});

userSchema.plugin(mongoosePaginate);

userSchema.statics.createUser = async function(params = {}){
  try{
    delete params.createdAt;
    delete params.updatedAt;
    delete params.isDeleted;
    delete params.isEmailVerified;
    delete params.status;
    delete params._id;
    const password = params.password || generateId(8, '', false);

    if(params.phone){
      let existingUser = await this.findOne({$or: [{phone: params.phone}, {email: params.email}]});
      if(existingUser) return {
        success: false,
        message: "User with this phone number or email already exists",
        existingUser
      };
    }
    const user = await this.create({password, ...params});
    if(user){
      return {
        success: true,
        data: user,
        password: password
      }
    }
    return null
  }catch(e){
    console.log(e);
    return null
  }
}

userSchema.statics.getUserByUserId = async function(userId = null){
  try{
    const user = await this.findOne({userId, isDeleted: false, isEmailVerified: true});
    if(user){
      return {
        success: true,
        data: user
      }
    }
    return {
      success: false,
      message: "User not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while fetching the user"
    }
  }
}
userSchema.statics.login = async function(email, password){
  try{
    const user = await this.findOne({email, isDeleted: false, isEmailVerified: true, status: USER_STATUS.ACTIVE});
    if(user){
      const isMatch = await bcrypt.compare(password, user.password);
      if(isMatch){
        return {
          success: true,
          data: user
        }
      }
    }
    return {
      success: false,
      message: "Invalid email or password"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while logging in"
    }
  }
}

userSchema.statics.updateUser = async function(userId, params = {}){
  try{
    console.log("Updating user:", userId, params);
    let user = await this.findOne({userId, isDeleted: false});
    if(user){
      Object.keys(params).forEach(e=>{
        if(params[e] !== undefined) user[e] = params[e];
      })
      user = await user.save();
      if(user) return {
        success: true,
        data: user
      };
    }
    return {
      success: false,
      message: "User not found"
    }
  }catch(e){
    console.log("Helloooooooo error>>>>>>>>>>>>>>>>>>>>>>>>>>>>>:    ", e);
    return {
      success: false,
      message: "An error occurred while updating the user"
    }
  }
}
userSchema.statics.activateAccount = async function(userId){
  try{
    console.log("Activating account:", userId);
    let user = await this.findOne({userId, isDeleted: false});
    if(user){
      user.status = USER_STATUS.ACTIVE;
      user.isEmailVerified = true;
      user = await user.save();
      if(user) return {
        success: true,
        data: user
      };
    }
    return {
      success: false,
      message: "User not found"
    }
  }catch(e){
    console.log("Helloooooooo error>>>>>>>>>>>>>>>>>>>>>>>>>>>>>:    ", e);
    return {
      success: false,
      message: "An error occurred while activating the account"
    }
  }
}
userSchema.statics.deleteUser = async function(userId){
  try{
    let user = await this.findOne({userId, isDeleted: false});
    if(user){
      user.isDeleted = true;
      user = await user.save();
      if(user) return {
        success: true,
        data: user
      };
    }
    return {
      success: false,
      message: "User not found"
    }
  }catch(e){
    console.log(e);
    return {
      success: false,
      message: "An error occurred while deleting the user"
    } 
  }
}
/**
 * Pre-save hook to hash the password before saving the user document.
 * This ensures that the password is stored securely in the database.
 */
userSchema.pre('save', async function(next){
  try{
    if(this.isModified('password')){
      const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  }catch(e){
    console.log(e);
    next();
  }
})
// userSchema.set('toObject', (
//   {
//     virtuals: true,
//     versionKey: false,
//     transform: (doc, ret) => {
//       delete ret.password;
//       return ret;
//     }
//   }
// ));
userSchema.set('toJSON', (
  {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
      delete ret.password;
      return ret;
    }
  }
));


userSchema.statics.getAllUsers = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, provider, durationType, amount, description, name,  } = params;

    const queryParam = {
      isDeleted: false,
      isSystem: false,
      isEmailVerified: true
    }

    if (provider) {
      queryParam.provider = provider;
    }

    if (durationType) {
      queryParam.durationType = durationType;
    }

    if (amount) {
      queryParam.amount = amount;
    }

    if (description) {
      queryParam.description = { $regex: `.*${description}.*`, $options: "i" };
    }

    if (name) {
      queryParam.name = { $regex: `.*${name}.*`, $options: "i" };
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}
userSchema.statics.getAllUsersByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, provider, durationType, isSystem, amount, description, name, isEmailVerified } = params;

    const queryParam = {
      isDeleted: false
    }

    if (provider) {
      queryParam.provider = provider;
    }
    
    if (typeof isSystem !== 'undefined') {
      queryParam.isSystem = isSystem;
    }
    
    if (typeof isEmailVerified !== 'undefined') {
      queryParam.isEmailVerified = isEmailVerified;
    }

    if (durationType) {
      queryParam.durationType = durationType;
    }

    if (amount) {
      queryParam.amount = amount;
    }

    if (description) {
      queryParam.description = { $regex: `.*${description}.*`, $options: "i" };
    }

    if (name) {
      queryParam.name = { $regex: `.*${name}.*`, $options: "i" };
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}


const model = mongoose.model('user', userSchema);

export default model;
