import {customAlphabet} from 'nanoid'


const  keys = "0123456789abcdefghijklmnopqrstuvwxyz"


export const generateId = (length = 16, prefix = '', prependTime = false) => {
  const nanoid = customAlphabet(keys, length);
  const id = nanoid().toUpperCase();
  return prefix + (prependTime ? `${generateCurrentTimeForId()}${id}` : id) ;
};

export const generateCurrentTimeForId = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
};

export function formatPaginatedData(data){
  if (!data) return {
    list: [],
    total: 0,
    totalPages: 0,
    hasMore: false
  };

  return {
    list: data.docs,
    total: data.totalDocs,
    totalPages: data.totalPages,
    hasMore: data.hasNextPage,
    currentPage: data.page,
    limit: data.limit
  }
}

export function validateEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
} 

export function doActionWithinTimeFrame( callback = e=>{}, params = {}, startTime = null, upperStartTime = null ){
  if(upperStartTime && startTime){
    startTime = Math.floor(Math.random() * (upperStartTime - startTime + 1)) + startTime;
  }
  setTimeout(()=>{
    callback(params);
  }, startTime);
}

export function policyProcessor(user = {}){
  
}