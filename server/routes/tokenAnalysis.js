const router = require('express').Router();
const svc = require('../services/tokenAnalysisService');

router.get('/summary', async (req, res) => {
  try { res.json(await svc.getSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/prompts', async (req, res) => {
  try { res.json(await svc.getPrompts()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/simulation', async (req, res) => {
  try { res.json(await svc.getSimulationResults()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/simulation/stats', async (req, res) => {
  try { res.json(await svc.getSimulationStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/simulation/chart-data', async (req, res) => {
  try { res.json(await svc.getSimulationChartData()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
