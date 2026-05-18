const express = require('express');
const router = express.Router();
const agentService = require('../services/agentService');

router.get('/', (req, res) => {
  res.json(agentService.getAll());
});

router.get('/:id', (req, res) => {
  const agent = agentService.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

module.exports = router;
