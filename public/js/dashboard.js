'use strict';

const STATUSES = ['pendiente', 'en-desarrollo', 'en-pausa', 'listo'];
const STATUS_LABELS = {
  pendiente: 'Pendiente', 'en-desarrollo': 'En Desarrollo',
  'en-pausa': 'En Pausa', listo: 'Listo',
};
const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' };

let allTasks = [];
let teamMembers = [];
let knownTags = [];

async function init() {
  try {
    const [{ team }, { tags }] = await Promise.all([
      fetch('/api/team').then(r => r.json()),
      fetch('/api/tags').then(r => r.json()),
    ]);
    teamMembers = team || [];
    knownTags = tags || [];
    const sel = document.getElementById('filterAssignee');
    teamMembers.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch (_) {}
  await loadTasks();
}

function tagLabel(tag) {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
}

function showArchived() {
  const el = document.getElementById('showArchived');
  return !!(el && el.checked);
}

async function loadTasks() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('kanban').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  try {
    const state = showArchived() ? 'all' : 'open';
    const res = await fetch(`/api/tasks?state=${state}`);
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
  const isArchived = task.state === 'closed';
  card.className = 'task-card' + (isArchived ? ' archived' : '');

  const isOverdue = task.deadline && task.deadline !== 'No especificado' && task.deadline < today;
  const otherStatuses = STATUSES.filter(s => s !== (task.status || 'pendiente'));
  const prog = task.progress || { done: 0, total: 0 };

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
      ${isArchived ? '<span class="archived-badge">Archivada</span>' : ''}
      ${task.client ? `<span class="meta-client">${esc(task.client)}</span>` : ''}
      <span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span>
      ${prog.total > 0 ? `<span class="progress-chip">✓ ${prog.done}/${prog.total}</span>` : ''}
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

  const isArchived = task.state === 'closed';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-meta">
      ${isArchived ? '<span class="archived-badge">Archivada</span>' : ''}
      <span class="status-badge status-${task.status || 'pendiente'}">${STATUS_LABELS[task.status] || task.status}</span>
      <span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span>
      ${task.client ? `<span class="meta-client">📁 ${esc(task.client)}</span>` : ''}
      ${assigneeHtml}
      ${task.deadline && task.deadline !== 'No especificado'
        ? `<span class="deadline${isOverdue ? ' overdue' : ''}">📅 ${task.deadline}${isOverdue ? ' · Vencida' : ''}</span>` : ''}
    </div>
    <div class="meta-edit-section">
      <div class="modal-section-title">Editar detalles</div>
      <div class="meta-edit-row">
        <label class="meta-edit-label">
          <span>Responsable</span>
          <select id="edit-assignee">
            <option value="">Sin asignar</option>
            ${teamMembers.map(m => `<option value="${esc(m)}"${(task.assignee || '').toLowerCase() === m.toLowerCase() ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </label>
        <label class="meta-edit-label">
          <span>Fecha límite</span>
          <input type="date" id="edit-deadline" value="${task.deadline && task.deadline !== 'No especificado' ? task.deadline : ''}">
        </label>
        <button id="save-meta-btn" class="btn btn-primary btn-sm">Guardar</button>
      </div>
    </div>
    ${task.description
      ? `<div class="modal-description">${esc(task.description)}</div>`
      : '<p class="modal-empty">Sin descripción.</p>'}
    ${task.deliverable && task.deliverable !== 'No especificado'
      ? `<div class="modal-deliverable"><span class="deliverable-label">Entregable:</span> ${esc(task.deliverable)}</div>`
      : ''}
    <div>
      <div class="modal-section-title">Tags</div>
      <div id="modal-tags"></div>
    </div>
    ${task.screenshotUrl
      ? `<a href="${task.screenshotUrl}" target="_blank" rel="noopener" class="screenshot-link">📎 Ver captura adjunta</a>` : ''}

    <div>
      <div class="modal-section-title">Subtareas</div>
      <div id="modal-subtasks"></div>
    </div>

    <div>
      <div class="modal-section-title">Comentarios</div>
      <div id="modal-comments"><p class="comment-empty">Cargando…</p></div>
      <div class="comment-form">
        <textarea id="comment-text" rows="2" placeholder="Escribe un comentario..."></textarea>
        <div class="comment-form-row">
          <select id="comment-author" class="comment-author-select">
            ${teamMembers.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
          </select>
          <button id="comment-send" class="btn btn-primary btn-sm">Comentar</button>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <a href="${task.url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Ver en GitHub ↗</a>
      ${task.status !== 'pendiente' && !isArchived ? `<button id="reject-btn" class="btn btn-danger btn-sm">Rechazar</button>` : ''}
      <button id="archive-btn" class="btn btn-secondary btn-sm">${isArchived ? 'Reabrir' : 'Archivar'}</button>
      <button class="btn btn-primary btn-sm" onclick="closeModal()">Cerrar</button>
    </div>
  `;

  renderSubtasks(task);
  wireComments(task);
  wireArchive(task);
  wireReject(task);
  wireMeta(task);
  wireTags(task);

  document.getElementById('task-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// ── Subtareas ──
function renderSubtasks(task) {
  const container = document.getElementById('modal-subtasks');
  if (!container) return;
  const subs = task.subtasks || [];
  container.innerHTML = `
    <div class="subtask-list">
      ${subs.map((s, i) => `
        <label class="subtask-row${s.done ? ' done' : ''}">
          <input type="checkbox" data-idx="${i}" ${s.done ? 'checked' : ''}>
          <span>${esc(s.text)}</span>
        </label>`).join('') || '<p class="comment-empty">Sin subtareas.</p>'}
    </div>
    <div class="subtask-add">
      <input type="text" id="subtask-new" placeholder="Nueva subtarea...">
      <button id="subtask-add-btn" class="btn btn-secondary btn-sm">Añadir</button>
    </div>
  `;

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.idx);
      task.subtasks[idx].done = cb.checked;
      saveSubtasks(task);
    });
  });

  const addBtn = container.querySelector('#subtask-add-btn');
  const addInput = container.querySelector('#subtask-new');
  const doAdd = () => {
    const text = addInput.value.trim();
    if (!text) return;
    task.subtasks = (task.subtasks || []).concat([{ text, done: false }]);
    saveSubtasks(task);
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
}

async function saveSubtasks(task) {
  try {
    const res = await fetch(`/api/tasks/${task.number}/subtasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtasks: task.subtasks }),
    });
    const updated = await res.json();
    task.subtasks = updated.subtasks;
    task.progress = updated.progress;
    const t = allTasks.find(x => x.number === task.number);
    if (t) { t.subtasks = updated.subtasks; t.progress = updated.progress; }
    renderSubtasks(task);
    renderBoard();
  } catch (err) { console.error('Error guardando subtareas', err); }
}

// ── Comentarios ──
async function wireComments(task) {
  const authorSel = document.getElementById('comment-author');
  if (authorSel) {
    const saved = localStorage.getItem('commentAuthor');
    if (saved && teamMembers.includes(saved)) authorSel.value = saved;
    authorSel.addEventListener('change', () => localStorage.setItem('commentAuthor', authorSel.value));
  }
  const sendBtn = document.getElementById('comment-send');
  if (sendBtn) sendBtn.addEventListener('click', () => postComment(task));
  await loadComments(task.number);
}

async function loadComments(number) {
  const box = document.getElementById('modal-comments');
  if (!box) return;
  try {
    const { comments } = await fetch(`/api/tasks/${number}/comments`).then(r => r.json());
    if (!comments || !comments.length) {
      box.innerHTML = '<p class="comment-empty">Sin comentarios todavía.</p>';
      return;
    }
    box.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-head">
          <span class="comment-author">${esc(c.author)}</span>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
        </div>
        <div class="comment-body">${esc(c.body)}</div>
      </div>`).join('');
  } catch (err) {
    console.error('Error cargando comentarios', err);
    box.innerHTML = '<p class="comment-empty">No se pudieron cargar los comentarios.</p>';
  }
}

async function postComment(task) {
  const textEl = document.getElementById('comment-text');
  const authorEl = document.getElementById('comment-author');
  const sendBtn = document.getElementById('comment-send');
  const body = textEl.value.trim();
  if (!body) return;
  const author = authorEl ? authorEl.value : '';
  sendBtn.disabled = true;
  try {
    await fetch(`/api/tasks/${task.number}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, body }),
    });
    textEl.value = '';
    await loadComments(task.number);
  } catch (err) {
    console.error('Error enviando comentario', err);
  } finally {
    sendBtn.disabled = false;
  }
}

// ── Editar tags ──
function wireTags(task) {
  const container = document.getElementById('modal-tags');
  if (!container) return;

  let localTags = [...(task.tags || [])];
  let localKnown = [...new Set([...knownTags, ...localTags])];

  function renderTagsEdit() {
    container.innerHTML = '';
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'tags-chips';

    localKnown.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (localTags.includes(tag) ? ' active' : '');
      chip.textContent = tagLabel(tag);
      chip.title = tag;
      chip.addEventListener('click', () => {
        const i = localTags.indexOf(tag);
        if (i >= 0) localTags.splice(i, 1); else localTags.push(tag);
        renderTagsEdit();
      });
      chipsDiv.appendChild(chip);
    });

    const addRow = document.createElement('div');
    addRow.className = 'chip-add-row';
    addRow.innerHTML = `<input type="text" id="modal-tag-input" class="chip-add-input" placeholder="Nuevo tag...">
      <button type="button" id="modal-tag-add-btn" class="btn btn-secondary btn-sm">+</button>`;
    chipsDiv.appendChild(addRow);
    container.appendChild(chipsDiv);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.style.marginTop = '0.5rem';
    saveBtn.textContent = 'Guardar tags';
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      try {
        const updated = await fetch(`/api/tasks/${task.number}/meta`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: localTags }),
        }).then(r => r.json());
        task.tags = updated.tags || [];
        const t = allTasks.find(x => x.number === task.number);
        if (t) t.tags = task.tags;
        localTags = [...task.tags];
        task.tags.forEach(tag => { if (!knownTags.includes(tag)) knownTags.push(tag); });
        localKnown = [...new Set([...knownTags, ...localTags])];
        renderBoard();
        renderTagsEdit();
        saveBtn.textContent = '✓ Guardado';
        setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = 'Guardar tags'; }, 1500);
      } catch (err) {
        console.error('Error guardando tags', err);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar tags';
      }
    });
    container.appendChild(saveBtn);

    const input = container.querySelector('#modal-tag-input');
    const addBtn = container.querySelector('#modal-tag-add-btn');
    const doAdd = () => {
      const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!val || localTags.includes(val)) { input.value = ''; return; }
      if (!localKnown.includes(val)) localKnown.push(val);
      localTags.push(val);
      input.value = '';
      renderTagsEdit();
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  }

  renderTagsEdit();
}

// ── Editar meta (responsable / fecha) ──
function wireMeta(task) {
  const btn = document.getElementById('save-meta-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const assignee = document.getElementById('edit-assignee').value;
    const deadline = document.getElementById('edit-deadline').value || 'No especificado';
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const updated = await fetch(`/api/tasks/${task.number}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: assignee || null, deadline }),
      }).then(r => r.json());
      const t = allTasks.find(x => x.number === task.number);
      if (t) Object.assign(t, updated);
      renderBoard();
      closeModal();
      openModal(Object.assign({}, task, updated));
    } catch (err) {
      console.error('Error guardando meta', err);
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });
}

// ── Archivar ──
function wireArchive(task) {
  const btn = document.getElementById('archive-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const archived = task.state !== 'closed';
    btn.disabled = true;
    try {
      await fetch(`/api/tasks/${task.number}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      closeModal();
      await loadTasks();
    } catch (err) {
      console.error('Error archivando', err);
      btn.disabled = false;
    }
  });
}

// ── Rechazar ──
function wireReject(task) {
  const btn = document.getElementById('reject-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const footer = btn.closest('.modal-footer');
    const form = document.createElement('div');
    form.className = 'reject-form';
    form.innerHTML = `
      <textarea id="reject-reason" rows="2" placeholder="Motivo del rechazo (opcional)..."></textarea>
      <div class="reject-actions">
        <button id="reject-confirm" class="btn btn-danger btn-sm">Confirmar rechazo</button>
        <button id="reject-cancel" class="btn btn-secondary btn-sm">Cancelar</button>
      </div>`;
    footer.insertBefore(form, footer.firstChild);

    document.getElementById('reject-cancel').addEventListener('click', () => {
      form.remove();
      btn.style.display = '';
    });

    document.getElementById('reject-confirm').addEventListener('click', async () => {
      const reason = document.getElementById('reject-reason').value.trim();
      const confirmBtn = document.getElementById('reject-confirm');
      confirmBtn.disabled = true;
      try {
        const authorSel = document.getElementById('comment-author');
        const author = authorSel ? authorSel.value : 'Equipo';
        const commentBody = reason ? `Rechazada: ${reason}` : 'Tarea rechazada — vuelve a pendiente.';
        await fetch(`/api/tasks/${task.number}/comments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author, body: commentBody }),
        });
        await fetch(`/api/tasks/${task.number}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pendiente' }),
        });
        const t = allTasks.find(x => x.number === task.number);
        if (t) t.status = 'pendiente';
        renderBoard();
        closeModal();
        openModal(Object.assign({}, task, { status: 'pendiente' }));
      } catch (err) {
        console.error('Error rechazando', err);
        confirmBtn.disabled = false;
      }
    });
  });
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'hace un momento';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es');
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
const showArchivedEl = document.getElementById('showArchived');
if (showArchivedEl) showArchivedEl.addEventListener('change', loadTasks);

const AUTO_REFRESH_MS = 15 * 60 * 1000;
setInterval(loadTasks, AUTO_REFRESH_MS);

init();
