import express from 'express';

import callbacks from '../controllers/public/callbacks.controller.js';

const router = express.Router();

router.post('/callbacks/tranzak', callbacks.tranzakCallback);
router.post('/callbacks/neero', callbacks.neeroCallback);

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', time: new Date().toISOString() },
    errorMsg: '',
    errorCode: 0,
  });
});

export default router;
