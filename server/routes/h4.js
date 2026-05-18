const express = require('express');
const router = express.Router();
const h4Service = require('../services/h4Service');

router.get('/all', async (req, res) => {
  try { res.json(await h4Service.getAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/catalog', async (req, res) => {
  try { res.json(await h4Service.getCatalog()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/obd', async (req, res) => {
  try { res.json(await h4Service.getObd()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cx', async (req, res) => {
  try { res.json(await h4Service.getCx()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
