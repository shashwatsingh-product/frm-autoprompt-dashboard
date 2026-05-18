const express = require('express');
const router = express.Router();
const svc = require('../services/h3TestService');

router.post('/summary', async (req, res) => {
  try { res.json(await svc.getSummary(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try { res.json(await svc.getSummary({})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/multi-summary', async (req, res) => {
  try { res.json(await svc.getMultiSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mismatches', async (req, res) => {
  try { res.json(await svc.getMismatches(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/data', async (req, res) => {
  try { res.json(await svc.getData(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/detail', async (req, res) => {
  try { res.json(await svc.getDetail(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/inter-run', async (req, res) => {
  try { res.json(await svc.getInterRun({})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
