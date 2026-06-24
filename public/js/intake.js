'use strict';

let knownTags = [];
let selectedTags = [];

async function init() {
  try {
    const { team } = await fetch('/api/team').then(r => r.json());
    const sel = document.getElementById('assignee');
    team.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch (_) {}
  try {
    const { tags } = await fetch('/api/tags').then(r => r.json());
    knownTags = tags || [];
  } catch (_) {}
  renderTagChips([]);
}

function tagLabel(tag) {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
}

function renderTagChips(active) {
  selectedTags = [...active];
  const container = document.getElementById('tags-chips');
  container.innerHTML = '';

  const allToShow = [...new Set([...knownTags, ...selectedTags])];
  allToShow.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (selectedTags.includes(tag) ? ' active' : '');
    chip.textContent = tagLabel(tag);
    chip.title = tag;
    chip.addEventListener('click', () => {
      const i = selectedTags.indexOf(tag);
      if (i >= 0) selectedTags.splice(i, 1); else selectedTags.push(tag);
      renderTagChips(selectedTags);
    });
    container.appendChild(chip);
  });

  const addRow = document.createElement('div');
  addRow.className = 'chip-add-row';
  addRow.innerHTML = `<input type="text" id="tag-input" class="chip-add-input" placeholder="Nuevo tag...">
    <button type="button" id="tag-add-btn" class="btn btn-secondary btn-sm">+</button>`;
  container.appendChild(addRow);

  const input = addRow.querySelector('#tag-input');
  const btn   = addRow.querySelector('#tag-add-btn');
  const doAdd = () => {
    const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!val || selectedTags.includes(val)) { input.value = ''; return; }
    if (!knownTags.includes(val)) knownTags.push(val);
    selectedTags.push(val);
    input.value = '';
    renderTagChips(selectedTags);
  };
  btn.addEventListener('click', doAdd);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
}

function fillReviewForm(task) {
  document.getElementById('title').value       = task.title || '';
  document.getElementById('titleCount').textContent = String((task.title || '').length);
  document.getElementById('client').value      = task.client || '';
  document.getElementById('assignee').value    = task.assignee || '';
  document.getElementById('priority').value    = task.priority || 'medium';
  document.getElementById('deadline').value    = task.deadline || '';
  document.getElementById('description').value = task.description || '';
  renderTagChips(task.tags || []);
}

document.getElementById('title').addEventListener('input', e => {
  document.getElementById('titleCount').textContent = String(e.target.value.length);
});

document.getElementById('screenshotFile').addEventListener('change', e => {
  const file = e.target.files[0];
  document.getElementById('screenshotFileName').textContent = file ? file.name : '';
});

document.getElementById('parseBtn').addEventListener('click', async () => {
  const text = document.getElementById('raw').value.trim();
  if (!text) return showToast('Pegá un mensaje primero', 'error');

  const btn = document.getElementById('parseBtn');
  const btnText = document.getElementById('parseBtnText');
  const spinner = document.getElementById('parseSpinner');
  btn.disabled = true; btnText.textContent = 'Analizando...'; spinner.classList.remove('hidden');

  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        client:        document.getElementById('clientHint').value.trim() || undefined,
        screenshotDesc: document.getElementById('screenshotDesc').value.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al analizar');
    fillReviewForm(data);
    document.getElementById('input-section').classList.add('hidden');
    document.getElementById('review-section').classList.remove('hidden');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btnText.textContent = 'Analizar con IA'; spinner.classList.add('hidden');
  }
});

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('review-section').classList.add('hidden');
  document.getElementById('input-section').classList.remove('hidden');
});

document.getElementById('createBtn').addEventListener('click', async () => {
  const title = document.getElementById('title').value.trim();
  if (!title) return showToast('El título es obligatorio', 'error');

  const btn = document.getElementById('createBtn');
  const btnText = document.getElementById('createBtnText');
  const spinner = document.getElementById('createSpinner');
  btn.disabled = true; btnText.textContent = 'Creando...'; spinner.classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('client', document.getElementById('client').value.trim());
    formData.append('assignee', document.getElementById('assignee').value);
    formData.append('priority', document.getElementById('priority').value);
    formData.append('deadline', document.getElementById('deadline').value);
    formData.append('description', document.getElementById('description').value.trim());
    formData.append('tags', JSON.stringify(selectedTags));
    formData.append('source', document.getElementById('source').value);
    const file = document.getElementById('screenshotFile').files[0];
    if (file) formData.append('screenshot', file);

    const res = await fetch('/api/tasks', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear');

    showToast(`Tarea creada: <a href="${data.url}" target="_blank">#${data.number} — ${esc(data.title)}</a>`, 'success');
    document.getElementById('raw').value = '';
    document.getElementById('clientHint').value = '';
    document.getElementById('screenshotDesc').value = '';
    document.getElementById('screenshotFile').value = '';
    document.getElementById('screenshotFileName').textContent = '';
    document.getElementById('review-section').classList.add('hidden');
    document.getElementById('input-section').classList.remove('hidden');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btnText.textContent = 'Crear Tarea'; spinner.classList.add('hidden');
  }
});

function showToast(html, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerHTML = html;
  toast.className = `toast toast-${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 6000);
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
