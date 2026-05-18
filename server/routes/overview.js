const express = require('express');
const router = express.Router();
const overviewService = require('../services/overviewService');

router.get('/', (req, res) => {
  res.json(overviewService.get());
});

module.exports = router;
