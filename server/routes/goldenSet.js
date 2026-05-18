const express = require('express');
const router = express.Router();
const goldenSetService = require('../services/goldenSetService');

router.get('/summary', async (req, res) => {
  try {
    res.json(await goldenSetService.getSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cohorts', async (req, res) => {
  try {
    res.json(await goldenSetService.getCohorts(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cohort-detail', async (req, res) => {
  try {
    res.json(await goldenSetService.getCohortDetail(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
