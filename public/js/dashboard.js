'use strict';

const STATUSES = ['pendiente', 'en-desarrollo', 'en-pausa', 'listo'];
const STATUS_LABELS = {
  pendiente: 'Pendiente', 'en-desarrollo': 'En Desarrollo',
  'en-pausa': 'En Pausa', listo: 'Listo',
};
const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' };

let allTasks = [];

async function init() {
  try {
    const { team } = await fetch('/api/team').then(r => r.json());
    const sel = document.getElementById('filterAssignee');
    team.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch (_) {}
  await loadTasks();
}

async function loadTasks() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('kanban').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  try {
    const res = await fetch('/api/tasks?state=open');
    const { tasks } = await res.json();
    allTasks = tasks || [];
    renderBoard();
  } catch (e) {
    console.error('Error cargando tareas', e);
  } finally {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('kanban').classList.remove('hidden');
  }
}

function getFilters() {
  return {
    assignee: document.getElementById('filterAssignee').value,
    priority: document.getElementById('filterPriority').value,
    client:   document.getElementById('filterClient').value.trim().toLowerCase(),
  };
}

function applyFilters(tasks) {
  const f = getFilters();
  return tasks.filter(t => {
    if (f.assignee && (t.assignee || '').toLowerCase() !== f.assignee.toLowerCase()) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.client && !(t.client || '').toLowerCase().includes(f.client)) return false;
    return true;
  });
}

function renderBoard() {
  const tasks   = applyFilters(allTasks);
  const today   = new Date().toISOString().slice(0, 10);
  let visible   = 0;

  STATUSES.forEach(status => {
    const col   = document.getElementById(`col-${status}`);
    const count = document.getElementById(`count-${status}`);
    const group = tasks.filter(t => (t.status || 'pendiente') === status);
    count.textContent = String(group.length);
    visible += group.length;
    col.innerHTML = '';
    group.forEach(task => col.appendChild(buildCard(task, today)));
  });

  document.getElementById('empty-state').classList.toggle('hidden', visible > 0);
}

function buildCard(task, today) {
  const card = document.createElement('div');
  card.className = 'task-card';

  const isOverdue = task.deadline && task.deadline !== 'No especificado' && task.deadline < today;
  const otherStatuses = STATUSES.filter(s => s !== (task.status || 'pendiente'));

  card.innerHTML = `
    <div class="card-top">
      <a class="card-title" href="${task.url}" target="_blank" rel="noopener">${esc(task.title)}</a>
      <div class="status-badge-wrap">
        <span class="status-badge status-${task.status || 'pendiente'}" title="Cambiar estado">
          ${STATUS_LABELS[task.status] || task.status}
        </span>
        <div class="status-dropdown hidden">
          ${otherStatuses.map(s => `
            <div class="status-option" data-status="${s}" data-number="${task.number}">
              ${STATUS_LABELS[s]}
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card-meta">
      ${task.client ? `<span class="meta-client">${esc(task.client)}</span>` : ''}
      <span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span>
      ${isOverdue || (task.deadline && task.deadline !== 'No especificado')
        ? `<span class="deadline${isOverdue ? ' overdue' : ''}">📅 ${task.deadline}</span>` : ''}
    </div>
    ${task.assignee
      ? `<div class="card-assignee">
           <span class="avatar" style="background:${avatarColor(task.assignee)}">${initials(task.assignee)}</span>
           <span>${esc(task.assignee)}</span>
         </div>` : ''}
    ${task.tags && task.tags.length
      ? `<div class="card-tags">${task.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${task.screenshotUrl
      ? `<a href="${task.screenshotUrl}" target="_blank" rel="noopener" class="screenshot-link">📎 Ver captura</a>` : ''}
  `;

  // Toggle dropdown on badge click
  const wrap = card.querySelector('.status-badge-wrap');
  const dropdown = card.querySelector('.status-dropdown');
  wrap.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.status-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.add('hidden');
    });
    dropdown.classList.toggle('hidden');
  });

  // Change status
  card.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', async e => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
      const num = Number(opt.dataset.number);
      const newStatus = opt.dataset.status;
      try {
        await fetch(`/api/tasks/${num}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const t = allTasks.find(x => x.number === num);
        if (t) t.status = newStatus;
        renderBoard();
      } catch (err) { console.error('Error actualizando estado', err); }
    });
  });

  // Open modal on card click (except status badge and title link)
  card.style.cursor = 'pointer';
  card.addEventListener('click', e => {
    if (e.target.closest('.status-badge-wrap') || e.target.closest('.card-title')) return;
    openModal(task);
  });

  return card;
}

function openModal(task) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.deadline && task.deadline !== 'No especificado' && task.deadline < today;

  document.getElementById('modal-title').textContent = task.title;

  const assigneeHtml = task.assignee ? `
    <span style="display:inline-flex;align-items:center;gap:0.3rem">
      <span class="avatar" style="background:${avatarColor(task.assignee)}">${initials(task.assignee)}</span>
      ${esc(task.assignee)}
    </span>` : '';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-meta">
      <span class="status-badge status-${task.status || 'pendiente'}">${STATUS_LABELS[task.status] || task.status}</span>
      <span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span>
      ${task.client ? `<span class="meta-client">📁 ${esc(task.client)}</span>` : ''}
      ${assigneeHtml}
      ${task.deadline && task.deadline !== 'No especificado'
        ? `<span class="deadline${isOverdue ? ' overdue' : ''}">📅 ${task.deadline}${isOverdue ? ' · Vencida' : ''}</span>` : ''}
    </div>
    ${task.description
      ? `<div class="modal-description">${esc(task.description)}</div>`
      : '<p class="modal-empty">Sin descripción.</p>'}
    ${task.tags && task.tags.length
      ? `<div class="card-tags">${task.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${task.screenshotUrl
      ? `<a href="${task.screenshotUrl}" target="_blank" rel="noopener" class="screenshot-link">📎 Ver captura adjunta</a>` : ''}
    <div class="modal-footer">
      <a href="${task.url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Ver en GitHub ↗</a>
      <button class="btn btn-primary btn-sm" onclick="closeModal()">Cerrar</button>
    </div>
  `;

  document.getElementById('task-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('task-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Close all dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.status-dropdown').forEach(d => d.classList.add('hidden'));
});

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name) {
  const palette = ['#FFA800', '#cc8600', '#6B5744', '#4d7c3b', '#a47c3b', '#9c5a42', '#230E00'];
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[Math.abs(h)];
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Filters
document.getElementById('filterAssignee').addEventListener('change', renderBoard);
document.getElementById('filterPriority').addEventListener('change', renderBoard);
let debounce;
document.getElementById('filterClient').addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(renderBoard, 280);
});
document.getElementById('refreshBtn').addEventListener('click', loadTasks);

const AUTO_REFRESH_MS = 15 * 60 * 1000;
setInterval(loadTasks, AUTO_REFRESH_MS);

init();
