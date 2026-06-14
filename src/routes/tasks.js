const router = require('express').Router();
const gh = require('../services/github');

router.get('/', async (req, res, next) => {
  try {
    const { assignee, priority, client, status, state } = req.query;
    const tasks = await gh.listTasks({ assignee, priority, client, status, state });
    res.json({ tasks });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const task = req.body;
    if (!task.title) return res.status(400).json({ error: 'Falta el título' });
    const created = await gh.createTask(task);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Falta el estado' });
    const updated = await gh.updateTaskStatus(id, status);
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
