const router = require('express').Router();
const { parseTask } = require('../services/claude');

router.post('/', async (req, res, next) => {
  try {
    const { text, client, screenshotDesc } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El texto está vacío' });
    const task = await parseTask(text, { clientHint: client, screenshotDesc });
    res.json(task);
  } catch (e) { next(e); }
});

module.exports = router;
