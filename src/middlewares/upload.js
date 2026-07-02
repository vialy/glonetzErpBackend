import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import crypto from 'node:crypto';

import config from '../config/index.js';

const UPLOAD_DIR = path.resolve(process.cwd(), config.uploads.dir);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const rnd = crypto.randomBytes(10).toString('hex');
    cb(null, `${Date.now()}_${rnd}${ext}`);
  },
});

const allowed = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
]);

function fileFilter(_req, file, cb) {
  if (!allowed.has(file.mimetype)) {
    return cb(new Error('unsupported_file_type'));
  }
  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxSizeMb * 1024 * 1024 },
});

/** Build a public URL for an uploaded file. */
export function publicUrlFor(filename) {
  return `${config.appBaseUrl}/${config.uploads.dir}/${filename}`;
}

export { UPLOAD_DIR };
