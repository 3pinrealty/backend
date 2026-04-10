const express = require('express');
const { createCashback } = require('../controllers/cashbackController');

const router = express.Router();

router.post('/', createCashback);

module.exports = router;

