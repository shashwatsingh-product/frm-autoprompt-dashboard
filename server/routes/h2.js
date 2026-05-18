const express = require('express');
const router = express.Router();
const h2Service = require('../services/h2Service');

router.get('/summary', async (req, res) => {
  try { res.json(await h2Service.getSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/incidents', async (req, res) => {
  try { res.json(await h2Service.getIncidents(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
