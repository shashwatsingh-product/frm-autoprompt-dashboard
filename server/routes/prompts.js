const express = require('express');
const router = express.Router();
const promptsService = require('../services/promptsService');

router.get('/summary', (req, res) => {
  res.json(promptsService.getSummary());
});

router.get('/', (req, res) => {
  res.json(promptsService.getPrompts());
});

router.get('/:id', (req, res) => {
  const prompt = promptsService.getPrompt(req.params.id);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
  res.json(prompt);
});

router.patch('/:id/status', (req, res) => {
  const { isLive } = req.body;
  if (typeof isLive !== 'boolean') return res.status(400).json({ error: 'isLive must be boolean' });
  const prompt = promptsService.updatePromptStatus(req.params.id, isLive);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
  res.json(prompt);
});

router.get('/mappings/list', (req, res) => {
  const filters = {
    marketplace: req.query.marketplace || null,
    return_reason: req.query.return_reason || null,
    vertical: req.query.vertical || null,
    prompt_id: req.query.prompt_id || null,
  };
  res.json(promptsService.getMappings(filters));
});

module.exports = router;
