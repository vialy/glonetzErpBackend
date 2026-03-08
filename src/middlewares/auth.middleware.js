import config from "../config/index.js";
import apiResponse from "../utils/api.response.js";
export const decodeUserToken = (req, res, next)=>{
  try{
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return apiResponse.failed(res, req.$t('Token is required'), 401);
    }

    const decoded = jsonwebtoken.verify(token, config.jwt.secret);
    req.userInfo = decoded;
    next(); 
  }catch(e){
    console.log(e);
    return apiResponse.failed(res, req.$t('Auth error'), 400001 )
  }
}
export const decodeAdminToken = (req, res, next)=>{
  try{
    req.isAdmin = true;
    next(); 
  }catch(e){
    console.log(e);
    return apiResponse.failed(res, req.$t('Failed to decode token'), )
  }
}