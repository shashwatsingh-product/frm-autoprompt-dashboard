const express = require('express');
const router = express.Router();
const commentsService = require('../services/commentsService');

router.get('/:pageId', (req, res) => {
  res.json(commentsService.getByPage(req.params.pageId));
});

router.post('/:pageId', (req, res) => {
  const { author, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });
  const comment = commentsService.add(req.params.pageId, { author, text: text.trim() });
  res.status(201).json(comment);
});

router.delete('/:pageId/:commentId', (req, res) => {
  const ok = commentsService.delete(req.params.pageId, req.params.commentId);
  if (!ok) return res.status(404).json({ error: 'Comment not found' });
  res.json({ ok: true });
});

module.exports = router;
