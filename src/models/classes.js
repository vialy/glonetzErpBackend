import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';
const { Schema } = mongoose;
import { formatPaginatedData, generateId } from '../utils/index.js';
import config from '../config/index.js';


const nameSchema = new Schema({
  _id: false,
  en:{
    type: String,
    default: ""
  },
  fr:{
    type: String,
    default: ""
  }
})

const classSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  classId: {
    type: String,
    required: true,
    unique: true,
    default(){
      return generateId(6, 'CL-')
    }
  },
  price: {
    type: Number,
    required: true
  },
  currencyCode: {
    type: String,
    default(){
      return "XAF"
    }
  },
  paymentValidityDuration: {
    type: Number,
    default: 30 /* default validity duration for payments in days */
   },
  description: {
    type: nameSchema,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deleted: {
    type: Boolean,
    default: false
  },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

classSchema.index({classId: 1, policyId: 1});

classSchema.plugin(mongoosePaginate);

classSchema.statics.createClass = async function(params = {}){
  try{
    const model =  await this.create(params);
    if(model){
      return model
    }
    return null
  }catch(e){
    console.log(e);
    return null
  }
}

classSchema.statics.getClassByClassId = async function(classId = null){
  try{
    const model =  await this.findOne({classId, deleted: false, isActive: true});
    if(model){
      return model
    }
    return null
  }catch(e){
    console.log(e);
    return null
  }
}

classSchema.statics.updateClass = async function(classId, params = {}){
  try{
    delete params.createdAt;
    delete params.updatedAt;
    delete params.deleted;
    let model =  await this.findOne({classId, deleted: false});
    if(model){
      Object.keys(params).forEach(e=>{
        model[e] = params[e];
      })
      model =  await model.save();
      if(model) return model;
    }
    return null
  }catch(e){
    console.log(e);
    return null
  }
}
classSchema.statics.deleteClass = async function(classId){
  try{
    let model =  await this.findOne({classId, deleted: false});
    if(model){
      model.deleted = true;
      model =  await model.save();
      if(model) return model;
    }
    return null
  }catch(e){
    console.log(e);
    return null
  }
}

classSchema.statics.getAllClasses = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, description, name,  } = params;

    const queryParam = {
      deleted: false,
      isActive: true
    }


    if (description) {
      queryParam.$or = [
        { 'description.en': { $regex: `.*${description}.*`, $options: "i" }},
        { 'description.fr': { $regex: `.*${description}.*`, $options: "i" }}
      ];
    }

    if (name) {
      queryParam.$or = [
        { 'name.en': { $regex: `.*${name}.*`, $options: "i" }},
        { 'name.fr': { $regex: `.*${name}.*`, $options: "i" }}
      ];
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}
classSchema.statics.getAllClassesByAdmin = async function(params = {}){
  try{

    const { pageNum:page = 1, pageSize = 10, description, name, isActive } = params;

    const queryParam = {
      deleted: false
    }
    
    if (isActive) {
      queryParam.isActive = isActive;
    }

    if (description) {
      queryParam.$or = [
        { 'description.en': { $regex: `.*${description}.*`, $options: "i" }},
        { 'description.fr': { $regex: `.*${description}.*`, $options: "i" }}
      ];
    }

    if (name) {
      queryParam.$or = [
        { 'name.en': { $regex: `.*${name}.*`, $options: "i" }},
        { 'name.fr': { $regex: `.*${name}.*`, $options: "i" }}
      ];
    }

    const result = await this.paginate(queryParam, { page, limit: pageSize, sort: "-createdAt" });

    return formatPaginatedData(result);
  }catch(e){
    console.log(e);
    return null;
  }
}


const model = mongoose.model('class', classSchema);

export default model;
