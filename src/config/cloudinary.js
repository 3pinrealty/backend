const cloudinary = require('cloudinary').v2;

const {
  CLOUD_NAME,
  CLOUD_API_KEY,
  CLOUD_API_SECRET,
} = process.env;

console.log("ENV CHECK:", {
  name: process.env.CLOUD_NAME,
  key: process.env.CLOUD_API_KEY,
});

if (!CLOUD_NAME || !CLOUD_API_KEY || !CLOUD_API_SECRET) {
  throw new Error(
    'Cloudinary is not configured. Please set CLOUD_NAME, CLOUD_API_KEY, and CLOUD_API_SECRET in your .env file.',
  );
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUD_API_KEY,
  api_secret: CLOUD_API_SECRET,
});

module.exports = cloudinary;

