const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const ALLOWED_PRIORITIES = ['high', 'medium', 'low'];
const ALLOWED_TAGS = ['design', 'development', 'maintenance', 'content', 'urgent'];

function buildPrompt(today, teamList, rawText, clientHint, screenshotDesc) {
  let content = `Eres un asistente que convierte mensajes desordenados (de WhatsApp o email, en español, inglés o spanglish) en una tarea estructurada para una agencia de diseño web.

Hoy es ${today}. Los miembros del equipo son: ${teamList.join(', ')}.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con EXACTAMENTE estas claves:

{
  "title":       string (máx 60 caracteres, claro y conciso),
  "client":      string o null (nombre del cliente si se menciona),
  "assignee":    string o null (SOLO uno de: ${teamList.join(', ')}, si se menciona),
  "priority":    "high" | "medium" | "low" (deduce de palabras de urgencia: "urgente", "ya", "ASAP", "para hoy" => high),
  "deadline":    string fecha ISO "YYYY-MM-DD" o null (resuelve fechas relativas usando la fecha de hoy),
  "description": string (reescritura limpia y profesional de lo que hay que hacer),
  "tags":        array de strings de este conjunto: ["design","development","maintenance","content","urgent"]
}

Reglas:
- Si un dato no aparece, usa null (o [] para tags).
- "assignee" debe coincidir EXACTAMENTE con un nombre del equipo o ser null.
- No inventes clientes ni fechas.

Mensaje a procesar:
${rawText}`;

  if (clientHint) content += `\n\n[Cliente sugerido]: ${clientHint}`;
  if (screenshotDesc) content += `\n\n[Descripción de captura]: ${screenshotDesc}`;
  return content;
}

function normalize(data, teamMembers) {
  return {
    title: (data.title || 'Sin título').slice(0, 60),
    client: data.client || null,
    assignee: teamMembers.includes(data.assignee) ? data.assignee : null,
    priority: ALLOWED_PRIORITIES.includes(data.priority) ? data.priority : 'medium',
    deadline: data.deadline || null,
    description: data.description || '',
    tags: Array.isArray(data.tags) ? data.tags.filter(t => ALLOWED_TAGS.includes(t)) : [],
  };
}

async function parseTask(rawText, { clientHint, screenshotDesc } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(today, config.teamMembers, rawText, clientHint, screenshotDesc);

  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const data = JSON.parse(text);
  return normalize(data, config.teamMembers);
}

module.exports = { parseTask };
