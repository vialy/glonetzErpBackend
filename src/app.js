import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import config, { ERROR_CODES } from './config/index.js';
import i18n from './middlewares/i18n.js';
import errorHandler from './middlewares/errorHandler.js';
import routes from './routes/index.js';

export default function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Translation — must be installed before routes
  app.use(i18n);

  // Static — serve uploaded proofs
  app.use(`/${config.uploads.dir}`, express.static(path.resolve(process.cwd(), config.uploads.dir)));

  // API root
  app.use('/api', routes);

  // Not-found — keep the standard envelope shape
  app.use((req, res) => {
    res.status(200).json({
      success: false,
      data: null,
      errorMsg: req.$t ? req.$t('not_found') : 'not_found',
      errorCode: ERROR_CODES.NOT_FOUND,
    });
  });

  app.use(errorHandler);

  return app;
}
