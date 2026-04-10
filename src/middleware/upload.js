const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Temporary upload directory before sending files to Cloudinary
const tmpDir = path.join(__dirname, '..', '..', 'uploads', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf', // NEW: Allow PDFs for floor plans
  ]);

  if (allowedMimeTypes.has(file.mimetype)) return cb(null, true);
  cb(new Error('Invalid file type. Only image and PDF uploads are allowed.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 20, // UPDATED: Allow more files
  },
});

// UPDATED: Accept multiple fields
module.exports = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'floorPlans', maxCount: 10 },
  { name: 'brochure', maxCount: 1 },
]);

