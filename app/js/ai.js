// AI providers. Default = Puter.js (free "user-pays" AI: no API key — the user signs in once to a free Puter account;
// chat, vision and image generation). Free-key providers: Pollinations, Google Gemini, Groq, OpenRouter. Claude (paid key).
// Keys stay in this browser and are only sent to the chosen provider.
// The system prompt is the Paloan Jewelry CAD Master skill itself, loaded from /skill.
import { SCHEMAS } from './schema.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.125.0/+esm';
let sdk = null, skillText = null;
const history = [];                       // provider-neutral: [{ role: 'user'|'assistant', text, images? }]

export const PROVIDERS = {
  puter: { label: 'Puter.js — FREE, no API key (free Puter sign-in)', free: true, needsKey: false, vision: true, model: '', models: ['', 'gpt-5-nano', 'gpt-5-mini', 'gemini-2.5-flash', 'claude-sonnet-4-5'], keyUrl: 'https://puter.com' },
  pollinations: { label: 'Pollinations.ai — free key (text, vision, images)', free: true, needsKey: true, vision: true, model: 'openai', models: ['openai', 'openai-fast', 'gemini'], keyUrl: 'https://enter.pollinations.ai/keys' },
  gemini: { label: 'Google Gemini — free API key (reads photos)', free: true, needsKey: true, vision: true, model: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'], keyUrl: 'https://aistudio.google.com/app/apikey' },
  groq: { label: 'Groq — free API key (very fast, reads photos)', free: true, needsKey: true, vision: true, model: 'meta-llama/llama-4-scout-17b-16e-instruct', models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'], keyUrl: 'https://console.groq.com/keys' },
  openrouter: { label: 'OpenRouter — free models with a free key', free: true, needsKey: true, vision: true, model: 'google/gemma-4-31b-it:free', models: ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free'], keyUrl: 'https://openrouter.ai/keys' },
  claude: { label: 'Anthropic Claude — paid key (best engineering)', free: false, needsKey: true, vision: true, model: 'claude-opus-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5'], keyUrl: 'https://console.anthropic.com' },
};
export const MODELS = { 'claude-opus-5-5': 'Claude Opus 5.5 (best)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster, cheaper)' };

const ls = { get: (k, d = '') => { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || d; } catch { return d; } } };
export const aiSettings = {
  get provider() { const p = ls.get('pjc.provider', 'puter'); return PROVIDERS[p] ? p : 'puter'; },
  set provider(p) { try { localStorage.setItem('pjc.provider', p); } catch { /* ignore */ } },
  keyFor(p) { return p === 'claude' ? ls.get('pjc.key') : ls.get('pjc.key.' + p); },
  get key() { return this.keyFor(this.provider); },
  set(key, remember, provider = this.provider) {
    const k = provider === 'claude' ? 'pjc.key' : 'pjc.key.' + provider;
    try { sessionStorage.setItem(k, key); if (remember) localStorage.setItem(k, key); else localStorage.removeItem(k); } catch { /* storage blocked */ }
  },
  get model() { return ls.get('pjc.model.' + this.provider, PROVIDERS[this.provider].model); },
  set model(m) { try { localStorage.setItem('pjc.model.' + this.provider, m); } catch { /* ignore */ } },
  get ready() { return !PROVIDERS[this.provider].needsKey || !!this.key; },
  get vision() { return PROVIDERS[this.provider].vision; },
  get label() { return PROVIDERS[this.provider].label.split(' —')[0]; },
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
      if (f.t === 'select') return `${f.k}: ${Object.keys(typeof f.opts === 'function' ? f.opts({}) : f.opts).filter(Boolean).map((x) => JSON.stringify(x)).join('|')}`;
      if (f.t === 'text') return `${f.k}: string`;
      if (f.t === 'check') return `${f.k}: boolean`;
      return `${f.k}: number${f.unit ? ` (${f.unit})` : ''}${f.min !== undefined ? ` [${f.min}–${f.max}]` : ''}`;
    });
    return `- ${type}: ${[...new Set(keys)].join('; ')}`;
  }).join('\n');
}

async function systemPrompt(compact = false) {
  const skill = await loadSkill();
  return `${compact ? skill.split('## Workflow')[0] : skill}

# Operating inside the Paloan Jewelry CAD web app
You are embedded in a browser CAD tool that generates parametric jewelry, validates manufacturability, estimates weight and exports Rhino/Grasshopper Python. The user sees a live 3D model. Each message may include a "CURRENT DESIGN" block (type, parameters, measured weight, validator results) — use those real numbers instead of guessing. Messages may include "IMAGE ANALYSIS" text produced by the app when the model cannot see images.

When the user asks you to create, convert, modify or optimise a design (including from a reference image), finish your answer with ONE fenced \`\`\`json block of this exact shape so the app can build it:
{"type": "ring|pendant|earring|bangle|chain|relief|name", "params": { ...only keys listed below... }}
Valid keys per type (units in mm unless stated):
${paramSpec()}
Only include keys you want to change. Keep dimensions manufacturable (respect the minimums in your knowledge). If an image shows something the generator cannot express (e.g. figurative carving), still give the closest parametric base and explain the manual Rhino steps for the rest.`;
}

export function resetConversation() { history.length = 0; }

/**
 * Ask the selected AI provider. images: [{media_type, data(base64)}]; imageNotes: text fallback for non-vision models.
 * onText(delta) receives streamed (Claude) or whole (others) text. Returns { text, design, truncated, provider }.
 */
export async function askAI({ prompt, images = [], context = '', imageNotes = '', onText = () => {} }) {
  const prov = aiSettings.provider, P = PROVIDERS[prov];
  if (P.needsKey && !aiSettings.key) throw new Error(`Add your free ${aiSettings.label} key in ⚙ AI settings (get one at ${P.keyUrl}) — or switch to Pollinations (no key).`);
  const useImages = P.vision ? images : [];
  let text = context ? `${prompt}\n\n<CURRENT DESIGN>\n${context}\n</CURRENT DESIGN>` : prompt;
  if (images.length && !P.vision) text += `\n\n<IMAGE ANALYSIS>\n${imageNotes || `${images.length} reference image(s) attached but this free model cannot see images; rely on the description.`}\n</IMAGE ANALYSIS>`;
  history.push({ role: 'user', text, images: useImages });
  let out = '', truncated = false;
  try {
    if (prov === 'claude') ({ out, truncated } = await viaClaude(onText));
    else if (prov === 'puter') out = await viaPuter();
    else if (prov === 'gemini') out = await viaGemini();
    else out = await viaOpenAI(prov);
  } catch (e) { history.pop(); throw e; }
  if (prov !== 'claude') onText(out);
  history.push({ role: 'assistant', text: out });
  return { text: out, design: extractDesign(out), truncated, provider: prov };
}
export const askClaude = askAI;

async function viaClaude(onText) {
  if (!sdk) sdk = (await import(SDK_URL)).default;
  const c = new sdk({ apiKey: aiSettings.key, dangerouslyAllowBrowser: true });
  const messages = history.map((h) => (h.role === 'user'
    ? { role: 'user', content: [...(h.images || []).map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })), { type: 'text', text: h.text }] }
    : { role: 'assistant', content: h.raw || [{ type: 'text', text: h.text }] }));
  const stream = c.beta.messages.stream({
    model: aiSettings.model, max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
    system: await systemPrompt(), messages,
  });
  stream.on('text', (d) => onText(d));
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const out = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  setTimeout(() => { const last = history[history.length - 1]; if (last && last.role === 'assistant') last.raw = msg.content; }, 0);
  return { out, truncated: msg.stop_reason === 'max_tokens' };
}

async function viaOpenAI(prov) {
  const P = PROVIDERS[prov];
  const url = { pollinations: 'https://gen.pollinations.ai/v1/chat/completions', groq: 'https://api.groq.com/openai/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions' }[prov];
  const headers = { 'Content-Type': 'application/json' };
  if (P.needsKey) headers.Authorization = 'Bearer ' + aiSettings.key;
  if (prov === 'openrouter') { headers['HTTP-Referer'] = location.origin + location.pathname; headers['X-Title'] = 'Paloan Jewelry CAD Master'; }
  const messages = [{ role: 'system', content: await systemPrompt() }, ...history.map((h) => ({
    role: h.role,
    content: h.images?.length ? [{ type: 'text', text: h.text }, ...h.images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.media_type};base64,${im.data}` } }))] : h.text,
  }))];
  const body = { model: aiSettings.model, messages };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${P.label.split(' —')[0]}: ${j.error?.message || j.error || r.status + ' ' + r.statusText}`);
  return j.choices?.[0]?.message?.content || '';
}

let puterReady = null;
export function loadPuter() {
  if (!puterReady) puterReady = new Promise((res, rej) => {
    if (window.puter) return res(window.puter);
    const sc = document.createElement('script');
    sc.src = 'https://js.puter.com/v2/';
    sc.onload = () => res(window.puter); sc.onerror = () => { puterReady = null; rej(new Error('Could not load Puter.js (offline?)')); };
    document.head.appendChild(sc);
  });
  return puterReady;
}
async function viaPuter() {
  const puter = await loadPuter();
  const last = history.length - 1;
  const messages = [{ role: 'system', content: await systemPrompt() }, ...history.map((h, i) => ({
    role: h.role,
    content: i === last && h.images?.length ? [h.text, ...h.images.map((im) => ({ image_url: { url: `data:${im.media_type};base64,${im.data}` } }))] : h.text,
  }))];
  const opts = aiSettings.model ? { model: aiSettings.model } : {};
  let r;
  try { r = await puter.ai.chat(messages, opts); }
  catch (e) { throw new Error('Puter: ' + (e?.message || e?.error?.message || e?.msg || JSON.stringify(e)) + ' — sign in to your free Puter account when the window opens.'); }
  const c = r?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : x.text || '')).join('');
  return String(r ?? '');
}

async function viaGemini() {
  const model = aiSettings.model;
  const contents = history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [...(h.images || []).map((im) => ({ inline_data: { mime_type: im.media_type, data: im.data } })), { text: h.text }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(aiSettings.key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: await systemPrompt() }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 8192 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini: ' + (j.error?.message || r.status));
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

export function extractDesign(text) {
  const blocks = [...text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  // small free models sometimes skip the fence — fall back to the last {...} that mentions "type"
  const bare = text.lastIndexOf('{"type"') >= 0 ? text.slice(text.lastIndexOf('{"type"')) : null;
  for (const src of [...blocks.reverse(), bare].filter(Boolean)) {
    try {
      const s = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
      const j = JSON.parse(s);
      if (j && SCHEMAS[j.type] && j.params && typeof j.params === 'object') return j;
    } catch { /* try next */ }
  }
  return null;
}

/** Free text → concept image. Pollinations (with its free key) when selected/available, otherwise Puter.js (no key). Returns a File. */
export async function generateConceptImage(prompt, { seed = Math.floor(Math.random() * 1e6), size = 768 } = {}) {
  const full = `${prompt}, single jewelry piece, product photo, centered, plain white background, studio lighting, high detail`;
  const polKey = aiSettings.keyFor('pollinations');
  if (polKey) {
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(full)}?width=${size}&height=${size}&nologo=true&seed=${seed}&model=flux`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + polKey } });
    const blob = await r.blob();
    if (blob.type.startsWith('image/')) return new File([blob], `concept-${seed}.jpg`, { type: blob.type });
    let msg = r.status + '';
    try { msg = JSON.parse(await blob.text()).error?.message || msg; } catch { /* keep */ }
    if (aiSettings.provider === 'pollinations') throw new Error('Pollinations image: ' + msg);
  }
  const puter = await loadPuter();
  let img;
  try { img = await puter.ai.txt2img(full); }
  catch (e) { throw new Error('Puter image: ' + (e?.message || e?.msg || JSON.stringify(e)) + ' — sign in to your free Puter account when asked.'); }
  const blob = await (await fetch(img.src)).blob();
  return new File([blob], `concept-${seed}.png`, { type: blob.type || 'image/png' });
}

export async function fileToImage(file) {
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  const media_type = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ? file.type : 'image/png';
  return { media_type, data, name: file.name };
}
