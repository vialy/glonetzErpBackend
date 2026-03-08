import mongoose from 'mongoose'

const user = process.env.MONGO_USERNAME;
const pass = process.env.MONGO_PASS;
const host = process.env.MONGO_HOST;
const dbName = process.env.MONGO_DB_NAME;
const encodedPassword = encodeURIComponent(pass);


// const CONNECTION_URL = `mongodb://${user}:${encodedPassword}@${host}/${dbName}?authSource=${dbName}&replicaSet=rs0`;
const CONNECTION_URL = `mongodb+srv://${user}:${encodedPassword}@${host}/${dbName}?appName=Cluster0`;

// mongoose.connect(CONNECTION_URL, {
//   useNewUrlParser: true,
//   directConnection: true,
//   useUnifiedTopology: true
// })


// mongoose.connection.on('connected', () => {
//   console.log('Mongo has connected successfully')

// })

// mongoose.connection.on('reconnected', () => {
//   console.log('Mongo has reconnected')
// })
// mongoose.connection.on('error', error => {
//   console.log('Mongo connection has an error', error)
//   mongoose.disconnect()
// })
// mongoose.connection.on('disconnected', () => {
//   console.log('Mongo connection is disconnected')
// })



// const uri = "mongodb+srv://glonezERPAdmin:<db_password>@cluster0.fpbjkwp.mongodb.net/?appName=Cluster0";
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };
async function run() {
  try {
    // Create a Mongoose client with a MongoClientOptions object to set the Stable API version
    await mongoose.connect(CONNECTION_URL, clientOptions);
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (e) {
    console.error("Error connecting to MongoDB:", e);
    // Ensures that the client will close when you finish/error
    await mongoose.disconnect();
  }
}
run().catch(console.dir);