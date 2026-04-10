const express = require('express');
const upload = require('../middleware/upload');
const {
  createProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  createBrochureLead,
  downloadBrochure,
} = require('../controllers/propertyController');

const router = express.Router();

router.post('/', upload, createProperty);
router.get('/', getAllProperties);
router.post('/:id/brochure-lead', createBrochureLead);
router.get('/:id/brochure-download', downloadBrochure);
router.get('/:id', getPropertyById);
router.put('/:id', upload, updateProperty);
router.delete('/:id', deleteProperty);

module.exports = router;

