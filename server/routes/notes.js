const express = require('express');
const router = express.Router();
const notesService = require('../services/notesService');

router.get('/:pageId', (req, res) => {
  res.json({ content: notesService.get(req.params.pageId) });
});

router.put('/:pageId', (req, res) => {
  const { content } = req.body;
  if (content == null) return res.status(400).json({ error: 'Content is required' });
  notesService.save(req.params.pageId, content);
  res.json({ ok: true });
});

module.exports = router;
