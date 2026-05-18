const express = require('express');
const router = express.Router();
const cohortService = require('../services/cohortService');

router.get('/', (req, res) => {
  const filters = {
    marketplace: req.query.marketplace || null,
    vertical: req.query.vertical || null,
    returnReason: req.query.returnReason || null,
  };
  res.json(cohortService.getAll(filters));
});

module.exports = router;
