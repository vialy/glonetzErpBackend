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

// utils/generatePassword.js

export function generatePassword({
  length = 12,
  uppercase = true,
  lowercase = true,
  numbers = true,
  symbols = true,
  excludeSimilar = false, // removes chars like O, 0, l, 1, I
} = {}) {
  if (length < 4) {
    throw new Error("Password length must be at least 4");
  }

  let upperChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let lowerChars = "abcdefghijklmnopqrstuvwxyz";
  let numberChars = "0123456789";
  let symbolChars = "!@#$%^&*()_+[]{}<>?/|~-=";

  if (excludeSimilar) {
    upperChars = upperChars.replace(/[OI]/g, "");
    lowerChars = lowerChars.replace(/[l]/g, "");
    numberChars = numberChars.replace(/[01]/g, "");
  }

  const selectedSets = [];

  if (uppercase) selectedSets.push(upperChars);
  if (lowercase) selectedSets.push(lowerChars);
  if (numbers) selectedSets.push(numberChars);
  if (symbols) selectedSets.push(symbolChars);

  if (selectedSets.length === 0) {
    throw new Error("At least one character type must be enabled");
  }

  // Ensure password includes at least one char from each selected set
  const passwordChars = selectedSets.map(getRandomChar);

  // Build the full character pool
  const allChars = selectedSets.join("");

  while (passwordChars.length < length) {
    passwordChars.push(getRandomChar(allChars));
  }

  // Shuffle so required chars aren't always at the beginning
  return shuffleArray(passwordChars).join("");
}

function getRandomChar(charset) {
  return charset[Math.floor(Math.random() * charset.length)];
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}