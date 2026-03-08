// utils/axiosUtil.js
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.API_BASE_URL || "https://api.camtel.cm", // set your default API base URL
  timeout: 15000, // 15s timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor (e.g. attach token)
axiosInstance.interceptors.request.use(
  (config) => {
    if (process.env.API_KEY) {
      config.headers["x-api-key"] = process.env.API_KEY;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (handle errors globally)
axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      console.error("API Error:", error.response.data.message || error.message);
    } else {
      console.error("Network Error:", error.message);
    }
    return Promise.reject(error);
  }
);

export default {
  get: (url, params = {}, config = {}) =>
    axiosInstance.get(url, { params, ...config }),

  post: (url, data = {}, config = {}) =>
    axiosInstance.post(url, data, config),

  put: (url, data = {}, config = {}) =>
    axiosInstance.put(url, data, config),

  patch: (url, data = {}, config = {}) =>
    axiosInstance.patch(url, data, config),

  delete: (url, config = {}) =>
    axiosInstance.delete(url, config),
};
