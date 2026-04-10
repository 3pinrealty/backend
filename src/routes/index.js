const express = require('express');
const healthRoutes = require('./healthRoutes');
const cashbackRoutes = require('./cashbackRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/cashback', cashbackRoutes);

module.exports = router;

