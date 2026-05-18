const express = require('express');
const router = express.Router();
const simulationService = require('../services/simulationService');

router.get('/summary', (req, res) => {
  res.json(simulationService.getSummary());
});

router.get('/agents', (req, res) => {
  res.json(simulationService.getAgentMetrics());
});

router.get('/cohorts', (req, res) => {
  const filters = {
    agent: req.query.agent || null,
    marketplace: req.query.marketplace || null,
    vertical: req.query.vertical || null,
    returnReason: req.query.returnReason || null,
  };
  res.json(simulationService.getCohortMetrics(filters));
});

router.get('/prompt-compare/:promptId', async (req, res) => {
  try {
    const result = await simulationService.getPromptComparison(req.params.promptId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
