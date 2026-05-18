const express = require('express');
const router = express.Router();
const labellingService = require('../services/labellingService');

router.get('/filters', async (req, res) => {
  try {
    res.json(await labellingService.getFilters());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/query', async (req, res) => {
  try {
    res.json(await labellingService.query(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/detail/:id', async (req, res) => {
  try {
    const result = await labellingService.getDetail(parseInt(req.params.id));
    if (!result) return res.status(404).json({ error: 'Record not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/download', async (req, res) => {
  try {
    res.json(await labellingService.download(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stats', async (req, res) => {
  try {
    res.json(await labellingService.getStats(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
