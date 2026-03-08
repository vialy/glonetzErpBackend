import { getTranslation } from '../i18n/index.js';
import apiResponse from '../utils/api.response.js';

export const mainMiddleware = (req, res, next) => {
  req.$t = (key) => getTranslation(req, key); 
  const headers = req.headers;
  console.log(`${req.method} ${req.url}`);
  next();
};
export const pageNotFoundMiddleware = (req, res, next) => {
  req.$t = (key) => getTranslation(req, key); 
  console.log(`${req.method} ${req.url}`);
  return apiResponse.failed(res, req.$t('Page not found'), 404);
};