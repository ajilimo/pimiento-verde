/**
 * Agency Task Coordinator — Google Apps Script
 *
 * Setup:
 * 1. En el editor de script: Extensions → Apps Script
 * 2. Project Settings → Script Properties → agregar:
 *    GITHUB_TOKEN  = tu token de GitHub (repo scope)
 *    GITHUB_OWNER  = tu usuario u organización de GitHub
 *    GITHUB_REPO   = nombre del repositorio
 *    SHEET_NAME    = Tareas  (o el nombre que quieras)
 * 3. Corré createTrigger() una vez (manualmente desde el editor)
 * 4. Corré syncGitHubIssues() una vez para verificar que funcione
 */

const HEADERS = ['ID', 'Título', 'Cliente', 'Responsable', 'Prioridad', 'Deadline', 'Estado', 'GitHub', 'Creado'];

function syncGitHubIssues() {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo  = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');
  const sheetName = props.getProperty('SHEET_NAME') || 'Tareas';

  if (!owner || !repo || !token) {
    throw new Error('Faltan Script Properties: GITHUB_OWNER, GITHUB_REPO o GITHUB_TOKEN');
  }

  const issues = fetchAllIssues(owner, repo, token);
  const rows = issues.map(toRow);

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#24292f')
    .setFontColor('#ffffff');

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    applyConditionalFormatting(sheet, rows.length);
  }

  sheet.autoResizeColumns(1, HEADERS.length);
  Logger.log(`Sincronizados ${rows.length} issues.`);
}

function fetchAllIssues(owner, repo, token) {
  const out = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`;
    const res = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error(`GitHub API error ${res.getResponseCode()}: ${res.getContentText()}`);
    }
    const data = JSON.parse(res.getContentText());
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(i => { if (!i.pull_request) out.push(i); });
    if (data.length < 100) break;
    page++;
  }
  return out;
}

function toRow(issue) {
  const labels = issue.labels.map(l => (typeof l === 'string' ? l : l.name));
  const pick = prefix => {
    const l = labels.find(x => x.startsWith(prefix));
    return l ? l.slice(prefix.length) : '';
  };
  const bodyField = marker => {
    if (!issue.body) return '';
    const m = issue.body.match(new RegExp('## ' + marker + '\n([^\n]+)'));
    return m ? m[1].trim() : '';
  };

  const prioridad = { high: 'Alta', medium: 'Media', low: 'Baja' }[pick('priority:')] || pick('priority:');
  const estado    = {
    pendiente: 'Pendiente', 'en-desarrollo': 'En Desarrollo',
    'en-pausa': 'En Pausa', listo: 'Listo',
  }[pick('status:')] || pick('status:') || 'Pendiente';

  return [
    issue.number,
    issue.title,
    bodyField('Cliente') || pick('client:'),
    pick('assignee:'),
    prioridad,
    bodyField('Deadline'),
    estado,
    issue.html_url,
    issue.created_at ? issue.created_at.slice(0, 10) : '',
  ];
}

function applyConditionalFormatting(sheet, rowCount) {
  if (rowCount === 0) return;
  const priorityCol = sheet.getRange(2, 5, rowCount, 1);
  // Limpiar reglas previas de esa columna no es posible directamente; se ignora silenciosamente
}

function createTrigger() {
  // Eliminar triggers previos del mismo nombre para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncGitHubIssues') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncGitHubIssues')
    .timeBased()
    .everyMinutes(10)
    .create();
  Logger.log('Trigger creado: syncGitHubIssues cada 10 minutos');
}
