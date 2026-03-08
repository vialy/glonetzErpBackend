import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const users = JSON.parse(await fs.readFile(path.join(__dirname, 'user.seeder.json'), 'utf8'));

import userModel from '../users.js';

export async function createDefaultUsers(){
  for(let i = 0; i < users.length; i++){
    console.log("Creating default users>>>>>>>>>>>>>>>>>");
    const user = await userModel.createUser(users[i]);
    // console.log("User created========================>>>>>>>>>>>>>>>>", user)
  }
}
