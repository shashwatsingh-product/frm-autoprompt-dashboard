const express = require('express');
const router = express.Router();
const verticalService = require('../services/verticalService');

router.get('/', (req, res) => {
  res.json(verticalService.getAll());
});

module.exports = router;
