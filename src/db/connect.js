import mongoose from 'mongoose';
import config from '../config/index.js';

mongoose.set('strictQuery', true);

export async function connect() {
  await mongoose.connect(config.mongo.uri);
  // eslint-disable-next-line no-console
  console.log(`[db] connected to ${config.mongo.uri.replace(/\/\/.*@/, '//***@')}`);
}

export async function disconnect() {
  await mongoose.disconnect();
}

export { mongoose };

export default { connect, disconnect, mongoose };
