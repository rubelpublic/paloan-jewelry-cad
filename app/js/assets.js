// Asset manager: a library of reusable components (gems, prong sets, cutters, setting presets, whole designs and
// saved part meshes). Stored in IndexedDB in this browser; export/import as JSON to share or back up.
import * as THREE from 'three';
import { GEM_DEFAULTS } from './geom/gems.js';

const DB = 'paloan-assets', STORE = 'assets';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const s = t.objectStore(STORE); const out = fn(s); t.oncomplete = () => res(out.result ?? out); t.onerror = () => rej(t.error); }); };

export const CATEGORIES = { gem: 'Gems', prong: 'Prong sets', cutter: 'Cutters', setting: 'Settings (gem + prongs + cutter)', design: 'Designs', part: 'Parts (meshes)' };

const g = (id, name, cut, L, W, gem = 'diamond', extra = {}) => ({ id: 'builtin-' + id, builtin: true, category: 'gem', name, data: { cut, L, W, gem, ...extra } });
export const BUILTIN = [
  g('r1', 'Round melee 1.0 mm', 'round', 1, 1), g('r13', 'Round melee 1.3 mm', 'round', 1.3, 1.3), g('r15', 'Round 1.5 mm', 'round', 1.5, 1.5),
  g('r2', 'Round 2.0 mm', 'round', 2, 2), g('r3', 'Round 3.0 mm (0.10 ct)', 'round', 3, 3), g('r5', 'Round 5.0 mm (0.50 ct)', 'round', 5, 5),
  g('p2', 'Princess 2.0 mm', 'princess', 2, 2), g('b31', 'Baguette 3 × 1.5 mm', 'emerald', 3, 1.5), g('m42', 'Marquise 4 × 2 mm', 'marquise', 4, 2),
  g('pr53', 'Pear 5 × 3 mm', 'pear', 5, 3), g('ov64', 'Oval 6 × 4 mm', 'oval', 6, 4), g('sapph2', 'Sapphire round 2.0 mm', 'round', 2, 2, 'sapphire'),
  g('ruby15', 'Ruby round 1.5 mm', 'round', 1.5, 1.5, 'ruby'), g('em2', 'Emerald round 2.0 mm', 'round', 2, 2, 'emerald'),
  { id: 'builtin-pr-none', builtin: true, category: 'prong', name: 'No prongs (bead / pavé seat)', data: { count: 0 } },
  { id: 'builtin-pr-2', builtin: true, category: 'prong', name: '2 claws (north–south)', data: { count: 2, dia: 0.5, height: 0.35, tip: 'bead' } },
  { id: 'builtin-pr-3', builtin: true, category: 'prong', name: '3 beads (pavé)', data: { count: 3, dia: 0.4, height: 0.25, tip: 'bead' } },
  { id: 'builtin-pr-4', builtin: true, category: 'prong', name: '4 beads (pavé / micro)', data: { count: 4, dia: 0.45, height: 0.3, tip: 'bead' } },
  { id: 'builtin-pr-6', builtin: true, category: 'prong', name: '6 claws (centre stones)', data: { count: 6, dia: 0.8, height: 0.6, tip: 'round' } },
  { id: 'builtin-cut-std', builtin: true, category: 'cutter', name: 'Standard seat + culet hole', data: { on: true, tol: 0.04, top: 1.2, hole: true, holeRatio: 0.55, holeDepth: 1.6 } },
  { id: 'builtin-cut-tight', builtin: true, category: 'cutter', name: 'Tight seat (micro pavé)', data: { on: true, tol: 0.02, top: 0.8, hole: true, holeRatio: 0.5, holeDepth: 1.2 } },
  { id: 'builtin-cut-blind', builtin: true, category: 'cutter', name: 'Blind seat (no hole)', data: { on: true, tol: 0.04, top: 1.0, hole: false } },
  { id: 'builtin-cut-open', builtin: true, category: 'cutter', name: 'Open back (big light hole)', data: { on: true, tol: 0.05, top: 1.2, hole: true, holeRatio: 0.8, holeDepth: 3 } },
  { id: 'builtin-set-pave', builtin: true, category: 'setting', name: 'Pavé 1.3 mm · 4 beads', data: { gem: { cut: 'round', L: 1.3, W: 1.3, gem: 'diamond' }, prongs: { count: 4, dia: 0.4, height: 0.25, tip: 'bead' }, cutter: { on: true, tol: 0.03, top: 1, hole: true, holeRatio: 0.55, holeDepth: 1.4 } } },
  { id: 'builtin-set-micro', builtin: true, category: 'setting', name: 'Micro pavé 1.0 mm · 3 beads', data: { gem: { cut: 'round', L: 1, W: 1, gem: 'diamond' }, prongs: { count: 3, dia: 0.32, height: 0.2, tip: 'bead' }, cutter: { on: true, tol: 0.02, top: 0.8, hole: true, holeRatio: 0.5, holeDepth: 1.2 } } },
  { id: 'builtin-set-bezelflush', builtin: true, category: 'setting', name: 'Flush (gypsy) 2.0 mm', data: { gem: { cut: 'round', L: 2, W: 2, gem: 'diamond', depth: -0.05 }, prongs: { count: 0 }, cutter: { on: true, tol: 0.02, top: 0.6, hole: true, holeRatio: 0.6, holeDepth: 2 } } },
  { id: 'builtin-set-claw', builtin: true, category: 'setting', name: 'Claw-set accent 2.5 mm · 4 claws', data: { gem: { cut: 'round', L: 2.5, W: 2.5, gem: 'diamond', depth: 0.6 }, prongs: { count: 4, dia: 0.55, height: 0.45, tip: 'round' }, cutter: { on: true, tol: 0.04, top: 1.2, hole: true, holeRatio: 0.55, holeDepth: 1.6 } } },
];

export async function listAssets() {
  let user = [];
  try { user = await tx('readonly', (s) => s.getAll()); } catch { /* IndexedDB blocked */ }
  return [...BUILTIN, ...(user || [])];
}
export async function saveAsset(a) {
  const asset = { id: a.id || 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), ...a };
  await tx('readwrite', (s) => s.put(asset));
  if (asset.category === 'part') partCache.set(asset.id, asset);
  return asset;
}
export async function deleteAsset(id) { await tx('readwrite', (s) => s.delete(id)); partCache.delete(id); }
export async function renameAsset(id, name) { const all = await tx('readonly', (s) => s.get(id)); if (all) { all.name = name; await tx('readwrite', (s) => s.put(all)); } }
export async function exportLibrary() { const user = (await listAssets()).filter((a) => !a.builtin); return JSON.stringify({ app: 'paloan-jewelry-cad', kind: 'asset-library', version: 1, assets: user }); }
export async function importLibrary(json) {
  const j = JSON.parse(json);
  const list = j.assets || (Array.isArray(j) ? j : []);
  for (const a of list) if (a && a.category && a.name && !a.builtin) await saveAsset({ ...a, id: a.id && !a.id.startsWith('builtin') ? a.id : undefined });
  return list.length;
}

/* ---------- part meshes (inserted into designs) ---------- */
const partCache = new Map();
export async function warmPartCache() { for (const a of await listAssets()) if (a.category === 'part') partCache.set(a.id, a); }
export function cachePart(asset) { if (asset?.category === 'part') partCache.set(asset.id, asset); }
export function getPart(id) { return partCache.get(id); }

/** Serialise geometries (non-indexed float arrays, base64) for a part asset. */
export function packGeometries(geos) {
  const toB64 = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  return geos.map((g) => { const h = g.index ? g.toNonIndexed() : g; return toB64(new Float32Array(h.attributes.position.array)); });
}
export function unpackGeometries(list) {
  return list.map((b64) => {
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(u8.buffer), 3));
    g.computeVertexNormals();
    return g;
  });
}

/** Engine hook: add inserted library parts. inserts = [{ id, name, kind }] (transforms come from Edit mode). */
export function addInserts(model, inserts) {
  for (const [i, ins] of (inserts || []).entries()) {
    const a = getPart(ins.id) || (ins.embedded ? { data: ins.embedded } : null);
    if (!a) { model.meta.missingInserts = (model.meta.missingInserts || 0) + 1; continue; }
    const pieces = unpackGeometries(a.data.pieces);
    model.parts.push({ name: `Insert: ${ins.name || a.name} #${i + 1}`, layer: 'Library::' + (ins.name || a.name), kind: a.data.kind || 'metal', gem: a.data.gem, pieces, noGemCut: a.data.kind === 'stone' });
  }
}

export function gemDefaultsFrom(asset) {
  const d = asset.data;
  if (asset.category === 'gem') return { gem: { ...d } };
  if (asset.category === 'prong') return { prongs: { ...GEM_DEFAULTS.prongs, ...d } };
  if (asset.category === 'cutter') return { cutter: { ...GEM_DEFAULTS.cutter, ...d } };
  if (asset.category === 'setting') return { gem: { ...d.gem }, prongs: { ...GEM_DEFAULTS.prongs, ...d.prongs }, cutter: { ...GEM_DEFAULTS.cutter, ...d.cutter } };
  return {};
}
