const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const ALLOWED_PRIORITIES = ['high', 'medium', 'low'];
const ALLOWED_TAGS = ['design', 'development', 'maintenance', 'content', 'urgent'];

function buildSystemPrompt(today, teamList) {
  return `Eres un asistente que convierte mensajes desordenados (de WhatsApp o email, en español, inglés o spanglish) en una tarea estructurada para una agencia de diseño web.

Hoy es ${today}. Los miembros del equipo son: ${teamList.join(', ')}.

Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional, sin markdown, con EXACTAMENTE estas claves:

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
- No inventes clientes ni fechas.`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
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
  const system = buildSystemPrompt(today, config.teamMembers);

  let userContent = rawText;
  if (clientHint) userContent += `\n\n[Cliente sugerido]: ${clientHint}`;
  if (screenshotDesc) userContent += `\n\n[Descripción de captura]: ${screenshotDesc}`;

  const resp = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = resp.content[0].text.trim();
  const jsonStr = extractJson(text);
  const data = JSON.parse(jsonStr);
  return normalize(data, config.teamMembers);
}

module.exports = { parseTask };
