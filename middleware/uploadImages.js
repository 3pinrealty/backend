const multer = require('multer');

// Configure multer to store files in memory
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { files: 10 },
}).array('images', 10);

module.exports = upload;
