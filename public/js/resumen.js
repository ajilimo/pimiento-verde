'use strict';

const STATUSES = ['pendiente', 'en-desarrollo', 'en-pausa', 'listo'];
const STATUS_LABELS = {
  pendiente: 'Pendiente', 'en-desarrollo': 'En Desarrollo',
  'en-pausa': 'En Pausa', listo: 'Listo',
};

async function load() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('content').classList.add('hidden');
  try {
    const [{ team }, { tasks }] = await Promise.all([
      fetch('/api/team').then(r => r.json()),
      fetch('/api/tasks?state=open').then(r => r.json()),
    ]);
    render(tasks || [], team || []);
  } catch (e) {
    console.error('Error cargando resumen', e);
  } finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  }
}

function render(tasks, team) {
  renderStatCards(tasks);
  renderPeopleTable(tasks, team);
  renderOverdue(tasks);
}

function renderStatCards(tasks) {
  const grid = document.getElementById('stat-grid');
  const counts = { pendiente: 0, 'en-desarrollo': 0, 'en-pausa': 0, listo: 0 };
  tasks.forEach(t => {
    const s = t.status || 'pendiente';
    counts[s] = (counts[s] || 0) + 1;
  });
  const sinAsignar = tasks.filter(t => !t.assignee).length;
  const today = new Date().toISOString().slice(0, 10);
  const vencidas = tasks.filter(t => t.deadline && t.deadline !== 'No especificado' && t.deadline < today).length;

  const cards = [
    { label: 'Total abiertas', value: tasks.length, cls: '' },
    ...STATUSES.map(s => ({ label: STATUS_LABELS[s], value: counts[s] || 0, cls: `stat-${s}` })),
    { label: 'Sin asignar', value: sinAsignar, cls: 'stat-warning' },
    { label: 'Vencidas', value: vencidas, cls: 'stat-danger' },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}">
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

function renderPeopleTable(tasks, team) {
  const tbody = document.querySelector('#people-table tbody');
  tbody.innerHTML = team.map(person => {
    const mine = tasks.filter(t => (t.assignee || '').toLowerCase() === person.toLowerCase());
    const byStatus = s => mine.filter(t => (t.status || 'pendiente') === s).length;
    return `
      <tr>
        <td>${esc(person)}</td>
        <td>${byStatus('pendiente')}</td>
        <td>${byStatus('en-desarrollo')}</td>
        <td>${byStatus('en-pausa')}</td>
        <td><strong>${mine.length}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderOverdue(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks
    .filter(t => t.deadline && t.deadline !== 'No especificado' && t.deadline < today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const container = document.getElementById('overdue-list');
  if (!overdue.length) {
    container.innerHTML = '<p style="color:#8b949e;font-size:0.875rem;">No hay tareas vencidas. 🎉</p>';
    return;
  }
  container.innerHTML = overdue.map(t => `
    <div class="overdue-item">
      <a href="${t.url}" target="_blank" rel="noopener">${esc(t.title)}</a>
      <span class="overdue-meta">${esc(t.client || 'Sin cliente')} · ${esc(t.assignee || 'Sin asignar')} · vencía ${t.deadline}</span>
    </div>
  `).join('');
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('refreshBtn').addEventListener('click', load);

const AUTO_REFRESH_MS = 15 * 60 * 1000;
setInterval(load, AUTO_REFRESH_MS);

load();
