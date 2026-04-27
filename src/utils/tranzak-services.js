import config from "../config/index.js";
import request from "./request.js";

let tranzakTokenTracker = null;
let token = null;



export const createRequest = async (data = {}) => {
  console.log("Creating request with data::::::::::::::", data);
  try {
    const response = await request.post(`${config.tranzak.BASE_URL}${config.tranzak.CREATE_REQUEST}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getValidToken()}`
      }
    });
    console.log("Create request response from Tranzak:::::::::::::::", response);
    if(response.success) return {
      success: true,
      data: response.data
    }
    return {
      success: false,
      message: response?.errorMsg || "Failed to create request"
    };
  } catch (error) {
    console.error('Error creating request:', error);
    return {
      success: false,
      message: "An error occurred while creating the request"
    };
  }
}
export const getRequest = async (requestId) => {
  try {
    const response = await request.get(`${config.tranzak.BASE_URL}${config.tranzak.GET_REQUEST}${requestId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getValidToken()}`
      }
    });
    console.log("Get request response from Tranzak:::::::::::::::", response);
    if(response?.success) return {
      success: true,
      data: response.data
    }
    return {
      success: false,
      message: response?.errorMsg || "Failed to fetch request"
    };
  } catch (error) {
    console.error('Error fetching request:', error);
    return {
      success: false,
      message: "An error occurred while fetching the request"
    };
  }
}

export const getToken = async () => {
  try {
    const response = await request.post(`${config.tranzak.BASE_URL}${config.tranzak.GENERATE_TOKEN}`, {
      appId: config.tranzak.appId,
      appKey: config.tranzak.appKey,
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    console.log("Token response from Tranzak:::::::::::::::", response);
    if(response && response.success){
      const { token, expiresIn } = response.data;
      tranzakTokenTracker = Date.now() + (expiresIn * 1000) - (5 * 60 * 1000); // refresh 5 minutes before expiry
      return token;
    }
    throw new Error(response?.errorMsg || "Failed to generate token");
  } catch (error) {
    console.error('Error fetching token:', error);
    throw error;
  }
}

export const getValidToken = async () => {
  if (!token || !tranzakTokenTracker || Date.now() >= tranzakTokenTracker) {
    token = await getToken();
  }
  return token;
}