const config = require('../config');

const STATUS_COLORS = {
  'status:pendiente':    '8b949e',
  'status:en-desarrollo':'0075ca',
  'status:en-pausa':     'd4a017',
  'status:listo':        '2da44e',
};
const PRIORITY_COLORS = {
  'priority:high':   'b60205',
  'priority:medium': 'e4e669',
  'priority:low':    '0e8a16',
};
const VALID_STATUSES = ['pendiente', 'en-desarrollo', 'en-pausa', 'listo'];

function colorFor(name) {
  if (STATUS_COLORS[name])   return STATUS_COLORS[name];
  if (PRIORITY_COLORS[name]) return PRIORITY_COLORS[name];
  if (name.startsWith('type:'))     return '0052cc';
  if (name.startsWith('client:'))   return '5319e7';
  if (name.startsWith('assignee:')) return '6e5494';
  return '888888';
}

function buildLabels(task) {
  const labels = ['status:pendiente'];
  if (task.priority) labels.push(`priority:${task.priority}`);
  if (task.client)   labels.push(`client:${task.client.toLowerCase().replace(/\s+/g, '-')}`);
  if (task.assignee) labels.push(`assignee:${task.assignee.toLowerCase()}`);
  if (task.tags)     task.tags.forEach(t => labels.push(`type:${t}`));
  return labels;
}

function buildIssueBody({ client, description, deadline, source, screenshotUrl }) {
  let body = `## Cliente
${client || 'No especificado'}

## Descripción
${description || ''}

## Deadline
${deadline || 'No especificado'}

## Origen
${source || 'Manual'}`;

  if (screenshotUrl) {
    body += `\n\n## Captura\n![captura](${screenshotUrl})`;
  }

  body += `\n\n---\n*Creado vía Agency Task Coordinator*`;
  return body;
}

function mapIssue(issue) {
  const labelNames = issue.labels.map(l => (typeof l === 'string' ? l : l.name));
  const pick = (prefix) => {
    const l = labelNames.find(x => x.startsWith(prefix));
    return l ? l.slice(prefix.length) : null;
  };
  const bodyField = (marker) => {
    if (!issue.body) return null;
    const m = issue.body.match(new RegExp(`## ${marker}\\n([^\\n]+)`));
    return m ? m[1].trim() : null;
  };
  const tags = labelNames.filter(l => l.startsWith('type:')).map(l => l.slice(5));
  const screenshotMatch = issue.body && issue.body.match(/## Captura\n!\[.*?\]\((.*?)\)/);
  const descMatch = issue.body && issue.body.match(/## Descripción\n([\s\S]*?)(?=\n## |\n---)/);

  const subSection = issue.body && issue.body.match(/## Subtareas\n([\s\S]*?)(?=\n## |\n---|$)/);
  const subtasks = subSection
    ? subSection[1].split('\n')
        .map(l => l.match(/^- \[( |x)\] (.*)$/))
        .filter(Boolean)
        .map(m => ({ text: m[2].trim(), done: m[1] === 'x' }))
    : [];
  const progress = { done: subtasks.filter(s => s.done).length, total: subtasks.length };

  return {
    id:          issue.id,
    number:      issue.number,
    title:       issue.title,
    client:      bodyField('Cliente')  || pick('client:'),
    assignee:    pick('assignee:'),
    priority:    pick('priority:')    || 'medium',
    deadline:    bodyField('Deadline'),
    status:      pick('status:')      || 'pendiente',
    description: descMatch ? descMatch[1].trim() : null,
    tags,
    subtasks,
    progress,
    source:      bodyField('Origen'),
    screenshotUrl: screenshotMatch ? screenshotMatch[1] : null,
    state:       issue.state,
    url:         issue.html_url,
    createdAt:   issue.created_at,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapComment(c) {
  const m = c.body.match(/^\*\*(.+?):\*\*\s?([\s\S]*)$/);
  return {
    id:        c.id,
    author:    m ? m[1] : ((c.user && c.user.login) || 'Equipo'),
    body:      m ? m[2] : c.body,
    createdAt: c.created_at,
  };
}

let _octokit = null;

async function getClient() {
  if (_octokit) return _octokit;
  let OctokitClass;
  try {
    OctokitClass = require('@octokit/rest').Octokit;
  } catch (e) {
    const mod = await import('@octokit/rest');
    OctokitClass = mod.Octokit;
  }
  _octokit = new OctokitClass({ auth: config.github.token });
  return _octokit;
}

async function ensureLabels(labelNames) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const existing = await octokit.paginate(octokit.issues.listLabelsForRepo, {
    owner, repo, per_page: 100,
  });
  const have = new Set(existing.map(l => l.name.toLowerCase()));
  for (const name of labelNames) {
    if (have.has(name.toLowerCase())) continue;
    try {
      await octokit.issues.createLabel({ owner, repo, name, color: colorFor(name) });
    } catch (e) {
      if (e.status !== 422) throw e;
    }
  }
}

async function uploadScreenshot(buffer, originalName, mimeType) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const ext = (originalName || '').split('.').pop().toLowerCase() || 'png';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner, repo,
    path: `screenshots/${filename}`,
    message: `Captura: ${filename}`,
    content: buffer.toString('base64'),
  });
  return data.content.download_url;
}

async function createTask(task) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const labels = buildLabels(task);
  await ensureLabels(labels);
  const { data } = await octokit.issues.create({
    owner, repo,
    title: task.title,
    body:  buildIssueBody(task),
    labels,
  });
  return mapIssue(data);
}

async function listTasks(filters = {}) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const labelFilters = [];
  if (filters.status)   labelFilters.push(`status:${filters.status}`);
  if (filters.priority) labelFilters.push(`priority:${filters.priority}`);
  if (filters.assignee) labelFilters.push(`assignee:${filters.assignee.toLowerCase()}`);
  if (filters.client)   labelFilters.push(`client:${filters.client.toLowerCase().replace(/\s+/g, '-')}`);

  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner, repo,
    state:  filters.state || 'open',
    labels: labelFilters.length ? labelFilters.join(',') : undefined,
    per_page: 100,
  });
  return issues.filter(i => !i.pull_request).map(mapIssue);
}

async function updateTaskStatus(issueNumber, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) throw Object.assign(new Error('Estado inválido'), { status: 400 });
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
  const current = issue.labels.map(l => (typeof l === 'string' ? l : l.name));
  const withoutStatus = current.filter(l => !l.startsWith('status:'));
  const newLabel = `status:${newStatus}`;
  await ensureLabels([newLabel]);
  const { data: updated } = await octokit.issues.update({
    owner, repo, issue_number: issueNumber,
    labels: [...withoutStatus, newLabel],
  });
  return mapIssue(updated);
}

async function updateIssueBodySection(issueNumber, marker, newContent) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
  const body = issue.body || '';
  const section = `## ${marker}\n${newContent}`;
  const sectionRe = new RegExp(`## ${escapeRegex(marker)}\\n[\\s\\S]*?(?=\\n\\n## |\\n\\n---|$)`);

  let newBody;
  if (sectionRe.test(body)) {
    newBody = body.replace(sectionRe, section);
  } else {
    const footerRe = /\n\n---\n\*Creado vía/;
    if (footerRe.test(body)) {
      newBody = body.replace(footerRe, `\n\n${section}$&`);
    } else {
      newBody = `${body}\n\n${section}`;
    }
  }

  const { data: updated } = await octokit.issues.update({
    owner, repo, issue_number: issueNumber, body: newBody,
  });
  return mapIssue(updated);
}

async function listTagLabels() {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const labels = await octokit.paginate(octokit.issues.listLabelsForRepo, {
    owner, repo, per_page: 100,
  });
  return labels
    .map(l => l.name)
    .filter(n => n.startsWith('type:'))
    .map(n => n.slice(5))
    .sort();
}

async function updateTaskMeta(issueNumber, { assignee, deadline }) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });

  const updatePayload = { owner, repo, issue_number: issueNumber };

  if (assignee !== undefined) {
    const current = issue.labels.map(l => (typeof l === 'string' ? l : l.name));
    const withoutAssignee = current.filter(l => !l.startsWith('assignee:'));
    if (assignee) {
      const newLabel = `assignee:${assignee.toLowerCase()}`;
      await ensureLabels([newLabel]);
      updatePayload.labels = [...withoutAssignee, newLabel];
    } else {
      updatePayload.labels = withoutAssignee;
    }
  }

  if (deadline !== undefined) {
    const body = issue.body || '';
    const newContent = deadline || 'No especificado';
    const section = `## Deadline\n${newContent}`;
    const sectionRe = new RegExp(`## ${escapeRegex('Deadline')}\\n[\\s\\S]*?(?=\\n\\n## |\\n\\n---|$)`);
    let newBody;
    if (sectionRe.test(body)) {
      newBody = body.replace(sectionRe, section);
    } else {
      const footerRe = /\n\n---\n\*Creado vía/;
      newBody = footerRe.test(body)
        ? body.replace(footerRe, `\n\n${section}$&`)
        : `${body}\n\n${section}`;
    }
    updatePayload.body = newBody;
  }

  const { data: updated } = await octokit.issues.update(updatePayload);
  return mapIssue(updated);
}

async function setTaskArchived(issueNumber, archived) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const { data: updated } = await octokit.issues.update({
    owner, repo, issue_number: issueNumber,
    state: archived ? 'closed' : 'open',
  });
  return mapIssue(updated);
}

async function listComments(issueNumber) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner, repo, issue_number: issueNumber, per_page: 100,
  });
  return comments.map(mapComment);
}

async function createComment(issueNumber, author, text) {
  const octokit = await getClient();
  const { owner, repo } = config.github;
  const body = author ? `**${author}:** ${text}` : text;
  const { data } = await octokit.issues.createComment({
    owner, repo, issue_number: issueNumber, body,
  });
  return mapComment(data);
}

module.exports = {
  createTask, listTasks, updateTaskStatus, uploadScreenshot,
  updateIssueBodySection, updateTaskMeta, setTaskArchived,
  listComments, createComment, listTagLabels,
};
