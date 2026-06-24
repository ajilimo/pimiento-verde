const router = require('express').Router();
const multer = require('multer');
const gh = require('../services/github');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res, next) => {
  try {
    const { assignee, priority, client, status, state } = req.query;
    const tasks = await gh.listTasks({ assignee, priority, client, status, state });
    res.json({ tasks });
  } catch (e) { next(e); }
});

router.post('/', upload.single('screenshot'), async (req, res, next) => {
  try {
    const task = req.body;
    if (typeof task.tags === 'string') {
      try { task.tags = JSON.parse(task.tags); } catch { task.tags = []; }
    }
    if (!task.title) return res.status(400).json({ error: 'Falta el título' });

    if (req.file) {
      task.screenshotUrl = await gh.uploadScreenshot(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

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

router.patch('/:id/meta', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { assignee, deadline, tags } = req.body;
    const updated = await gh.updateTaskMeta(id, { assignee, deadline, tags });
    res.json(updated);
  } catch (e) { next(e); }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;
    const updated = await gh.setTaskArchived(id, !!archived);
    res.json(updated);
  } catch (e) { next(e); }
});

router.patch('/:id/subtasks', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const subtasks = Array.isArray(req.body.subtasks) ? req.body.subtasks : [];
    const content = subtasks.length
      ? subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${String(s.text).replace(/\n/g, ' ')}`).join('\n')
      : 'Ninguna';
    const updated = await gh.updateIssueBodySection(id, 'Subtareas', content);
    res.json(updated);
  } catch (e) { next(e); }
});

router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await gh.listComments(Number(req.params.id));
    res.json({ comments });
  } catch (e) { next(e); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const { author, body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comentario vacío' });
    const created = await gh.createComment(Number(req.params.id), author, body.trim());
    res.status(201).json(created);
  } catch (e) { next(e); }
});

module.exports = router;
