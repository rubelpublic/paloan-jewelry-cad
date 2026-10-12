// Fonts for name pendants, monograms and engraving: three.js typefaces, Google script fonts (TTF) and user uploads.
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';

const T = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/';
const G = (pkg, ver, file) => `https://cdn.jsdelivr.net/npm/@expo-google-fonts/${pkg}@${ver}/${file}`;
export const FONTS = {
  pacifico:   { label: 'Pacifico (bold script, connected)', ttf: G('pacifico', '0.4.1', '400Regular/Pacifico_400Regular.ttf') },
  dancing:    { label: 'Dancing Script Bold (script)', ttf: G('dancing-script', '0.4.2', '700Bold/DancingScript_700Bold.ttf') },
  greatvibes: { label: 'Great Vibes (fine script)', ttf: G('great-vibes', '0.4.1', '400Regular/GreatVibes_400Regular.ttf') },
  allura:     { label: 'Allura (elegant script)', ttf: G('allura', '0.4.2', '400Regular/Allura_400Regular.ttf') },
  parisienne: { label: 'Parisienne (script)', ttf: G('parisienne', '0.4.1', '400Regular/Parisienne_400Regular.ttf') },
  cinzel:     { label: 'Cinzel Bold (roman capitals)', ttf: G('cinzel', '0.4.2', '700Bold/Cinzel_700Bold.ttf') },
  helvetiker: { label: 'Helvetiker Bold (sans)', json: T + 'helvetiker_bold.typeface.json' },
  optimer:    { label: 'Optimer Bold (humanist)', json: T + 'optimer_bold.typeface.json' },
  gentilis:   { label: 'Gentilis Bold (serif)', json: T + 'gentilis_bold.typeface.json' },
  droidserif: { label: 'Droid Serif Bold', json: T + 'droid/droid_serif_bold.typeface.json' },
};
const cache = new Map(), pending = new Map();

export const fontOptions = () => Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.label]));
export const getFont = (key) => cache.get(key) || null;

export async function ensureFont(key) {
  if (cache.has(key)) return cache.get(key);
  const f = FONTS[key];
  if (!f) throw new Error('Unknown font ' + key);
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const r = await fetch(f.json || f.ttf);
      if (!r.ok) throw new Error('Font download failed: ' + f.label);
      const font = f.json ? new FontLoader().parse(await r.json()) : new Font(new TTFLoader().parse(await r.arrayBuffer()));
      cache.set(key, font);
      return font;
    })().finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

/** Register a user TTF/OTF; returns its key. */
export async function registerFontFile(file) {
  const key = 'custom-' + file.name.replace(/\W+/g, '_').toLowerCase();
  const font = new Font(new TTFLoader().parse(await file.arrayBuffer()));
  cache.set(key, font);
  FONTS[key] = { label: file.name.replace(/\.(ttf|otf)$/i, '') + ' (uploaded)', uploaded: true };
  return key;
}

/** Shapes for a text string with optional extra letter spacing (mm). */
export function textShapes(font, text, size, spacing = 0) {
  if (!spacing) return font.generateShapes(text, size);
  const shapes = [];
  const scale = size / font.data.resolution;
  let x = 0;
  for (const ch of text) {
    const glyph = font.data.glyphs[ch] || font.data.glyphs['?'];
    if (ch !== ' ') for (const s of font.generateShapes(ch, size)) { s.getPoints(); shapes.push(offsetShape(s, x)); }
    x += (glyph ? glyph.ha * scale : size * 0.5) + spacing;
  }
  return shapes;
}
function offsetShape(s, dx) {
  const m = (path) => { path.curves.forEach((c) => { for (const k of ['v0', 'v1', 'v2', 'v3']) if (c[k]) c[k].x += dx; }); return path; };
  m(s); s.holes.forEach(m);
  return s;
}
