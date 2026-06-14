require('dotenv').config();
const path    = require('path');
const express = require('express');

const parseRouter = require('./src/routes/parse');
const tasksRouter = require('./src/routes/tasks');
const config  = require('./src/config');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/parse', parseRouter);
app.use('/api/tasks', tasksRouter);
app.get('/api/team',   (req, res) => res.json({ team: config.teamMembers }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Central error handler
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Error interno' });
});

app.listen(config.port, () => {
  console.log(`Agency Task Coordinator corriendo en http://localhost:${config.port}`);
});
