// Optional Claude integration (bring your own API key; the key never leaves this browser except to api.anthropic.com).
// The system prompt is the Paloan Jewelry CAD Master skill itself, loaded from /skill.
import { SCHEMAS } from './schema.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.125.0/+esm';
let sdk = null, skillText = null;
const history = [];

export const MODELS = { 'claude-opus-5-5': 'Claude Opus 5.5 (best)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster, cheaper)' };

export const aiSettings = {
  get key() { try { return sessionStorage.getItem('pjc.key') || localStorage.getItem('pjc.key') || ''; } catch { return ''; } },
  set(key, remember) {
    try {
      sessionStorage.setItem('pjc.key', key);
      if (remember) localStorage.setItem('pjc.key', key); else localStorage.removeItem('pjc.key');
    } catch { /* storage blocked */ }
  },
  get model() { try { return localStorage.getItem('pjc.model') || 'claude-opus-5-5'; } catch { return 'claude-opus-5-5'; } },
  set model(m) { try { localStorage.setItem('pjc.model', m); } catch { /* ignore */ } },
};

async function loadSkill() {
  if (skillText) return skillText;
  try {
    const r = await fetch('skill/paloan-jewelry-cad-master/SKILL.md');
    skillText = r.ok ? (await r.text()).replace(/^---[\s\S]*?---/, '').trim() : '';
  } catch { skillText = ''; }
  return skillText;
}

function paramSpec() {
  return Object.entries(SCHEMAS).map(([type, s]) => {
    const keys = s.fields.map((f) => {
      if (f.t === 'select') return `${f.k}: ${Object.keys(typeof f.opts === 'function' ? f.opts() : f.opts).map((x) => JSON.stringify(x)).join('|')}`;
      if (f.t === 'text') return `${f.k}: string`;
      if (f.t === 'check') return `${f.k}: boolean`;
      return `${f.k}: number${f.unit ? ` (${f.unit})` : ''}${f.min !== undefined ? ` [${f.min}–${f.max}]` : ''}`;
    });
    return `- ${type}: ${[...new Set(keys)].join('; ')}`;
  }).join('\n');
}

async function systemPrompt() {
  const skill = await loadSkill();
  return `${skill}

# Operating inside the Paloan Jewelry CAD web app
You are embedded in a browser CAD tool that generates parametric jewelry, validates manufacturability, estimates weight and exports Rhino/Grasshopper Python. The user sees a live 3D model. Each message may include a "CURRENT DESIGN" block (type, parameters, measured weight, validator results) — use those real numbers instead of guessing.

When the user asks you to create, convert, modify or optimise a design (including from a reference image), finish your answer with ONE fenced \`\`\`json block of this exact shape so the app can build it:
{"type": "ring|pendant|earring|bangle|chain", "params": { ...only keys listed below... }}
Valid keys per type (units in mm unless stated):
${paramSpec()}
Only include keys you want to change. Keep dimensions manufacturable (respect the minimums in your knowledge). If an image shows something the generator cannot express (e.g. figurative carving), still give the closest parametric base and explain the manual Rhino steps for the rest.`;
}

async function client() {
  const key = aiSettings.key;
  if (!key) throw new Error('Add your Anthropic API key in AI settings first (or use the offline brief parser).');
  if (!sdk) sdk = (await import(SDK_URL)).default;
  return new sdk({ apiKey: key, dangerouslyAllowBrowser: true });
}

export function resetConversation() { history.length = 0; }

/**
 * Ask Claude. images: [{media_type, data(base64)}]. onText(delta) streams text.
 * Returns { text, design } where design is the parsed JSON block (or null).
 */
export async function askClaude({ prompt, images = [], context = '', onText = () => {} }) {
  const c = await client();
  const content = [
    ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
    { type: 'text', text: context ? `${prompt}\n\n<CURRENT DESIGN>\n${context}\n</CURRENT DESIGN>` : prompt },
  ];
  history.push({ role: 'user', content });
  const stream = c.beta.messages.stream({
    model: aiSettings.model,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: await systemPrompt(),
    messages: history,
  });
  stream.on('text', (d) => onText(d));
  let msg;
  try { msg = await stream.finalMessage(); }
  catch (e) { history.pop(); throw e; }
  history.push({ role: 'assistant', content: msg.content });
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, design: extractDesign(text), truncated: msg.stop_reason === 'max_tokens' };
}

export function extractDesign(text) {
  const m = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    if (j && SCHEMAS[j.type] && j.params && typeof j.params === 'object') return j;
  } catch { /* invalid */ }
  return null;
}

export async function fileToImage(file) {
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  const media_type = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ? file.type : 'image/png';
  return { media_type, data, name: file.name };
}
