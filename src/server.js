import express from 'express';
import routes from './routes/index.js';
import cors from 'cors';
import { mainMiddleware, pageNotFoundMiddleware } from './middlewares/main.middleware.js';

import config from './config/index.js';
import "./config/mongo.js";
import { createDefaultUsers } from './models/seeders/index.js';


const app = express();

app.use(cors())


app.use(express.json());
app.use(mainMiddleware);

app.use('/v1', routes);

app.use(pageNotFoundMiddleware);


const PORT = config.server.port || 5001;
app.listen(PORT, () => {
  
  console.log(`Server running on port ${PORT}`);

  createDefaultUsers();

});
