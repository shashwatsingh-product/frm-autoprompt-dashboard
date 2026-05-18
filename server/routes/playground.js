const express = require('express');
const router = express.Router();
const playgroundService = require('../services/playgroundService');

router.get('/options', async (req, res) => {
  try {
    const options = await playgroundService.getCohortOptions();
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/simulation-status', async (req, res) => {
  try {
    const status = await playgroundService.getSimulationStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const { agent, vertical, returnReason, marketplace, promptText, sampleSize } = req.body;
    if (!promptText || !promptText.trim()) {
      return res.status(400).json({ error: 'promptText is required' });
    }
    const result = await playgroundService.runSimulation({
      agent, vertical, returnReason, marketplace, promptText,
      sampleSize: Math.min(sampleSize || 50, 200),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
