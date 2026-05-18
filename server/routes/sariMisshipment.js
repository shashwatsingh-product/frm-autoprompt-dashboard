const express = require('express');
const router = express.Router();
const svc = require('../services/sariMisshipmentService');

router.get('/summary', async (req, res) => {
  try { res.json(await svc.getSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/data', async (req, res) => {
  try { res.json(await svc.getData(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/confusion', async (req, res) => {
  try { res.json(await svc.getConfusion()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
