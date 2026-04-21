const express = require('express');
const healthRoutes = require('./healthRoutes');
const cashbackRoutes = require('./cashbackRoutes');
const contactRoutes = require('./contactRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/cashback', cashbackRoutes);
router.use('/contact', contactRoutes);

module.exports = router;

