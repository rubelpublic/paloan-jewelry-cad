// Free-placed gems (JewelCraft-style): gem + prongs + cutter on any surface point, rows, compaction, inventory.
import * as THREE from 'three';
import { CUTS, caratFromDims, stoneDimsFromCarat } from '../data.js';
import { V, orientOutward, tube, sphere, merge } from './util.js';
import { stoneGeometry, outline, prongAngles, rimPoint } from './stone.js';

export const GEM_DEFAULTS = {
  cut: 'round', L: 1.5, W: 1.5, gem: 'diamond', depth: 0.05,          // table height above the metal surface (mm)
  rot: 0,
  prongs: { count: 0, dia: 0.45, height: 0.35, tip: 'bead', overlap: 0.12 },
  cutter: { on: true, tol: 0.04, top: 1.2, hole: true, holeRatio: 0.55, holeDepth: 1.6 },
};

/** Closed loft of scaled outlines: rings = [{ s, y }] from top to bottom; caps at both ends. */
function loftRings(ol, rings) {
  const N = ol.length, pos = [], idx = [];
  rings.forEach((r) => ol.forEach(([x, z]) => pos.push(x * r.s, r.y, z * r.s)));
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < N; i++) {
    const a = k * N + i, b = k * N + (i + 1) % N, c = (k + 1) * N + i, d = (k + 1) * N + (i + 1) % N;
    idx.push(a, b, c, b, d, c);
  }
  const top = pos.length / 3; pos.push(0, rings[0].y, 0);
  const bot = pos.length / 3; pos.push(0, rings[rings.length - 1].y, 0);
  const L = rings.length - 1;
  for (let i = 0; i < N; i++) { idx.push(top, (i + 1) % N, i); idx.push(bot, L * N + i, L * N + (i + 1) % N); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  orientOutward(g); g.computeVertexNormals();
  return g;
}

/** Gem cutter in the local gem frame (girdle at y = 0): straight seat above, pavilion cone, optional culet hole. */
export function cutterGeometry(cut, L, W, c = GEM_DEFAULTS.cutter, st = stoneGeometry(cut, L, W)) {
  const ol = outline(cut, L, W, 48);
  const s = 1 + (2 * c.tol) / Math.min(L, W);
  const rings = [{ s, y: st.top + c.top }, { s, y: -st.girdle / 2 }];
  if (c.hole) {
    const hr = Math.max(0.2, Math.min(0.9, c.holeRatio));
    rings.push({ s: hr, y: -st.girdle / 2 - st.pavilion * (1 - hr) }, { s: hr, y: st.culet - c.holeDepth });
  } else rings.push({ s: 0.08, y: st.culet - 0.05 });
  return loftRings(ol, rings);
}

/** Transform: local gem frame → world (girdle on the surface normal, table `depth` above the surface). */
export function gemMatrix(g, st) {
  const n = new THREE.Vector3(...g.n).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((g.rot || 0) * Math.PI) / 180);
  q.multiply(spin);
  const lift = (g.depth ?? GEM_DEFAULTS.depth) - st.top;              // girdle below the surface so the table sits `depth` above it
  const p = new THREE.Vector3(...g.p).addScaledVector(n, lift);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}

export function buildPlacedGem(g) {
  const st = stoneGeometry(g.cut, g.L, g.W, { N: g.L > 2.5 ? 32 : 16 });
  const M = gemMatrix(g, st);
  const stone = st.geometry.clone().applyMatrix4(M);
  const pr = { ...GEM_DEFAULTS.prongs, ...(g.prongs || {}) };
  const prongs = [];
  if (pr.count > 0) {
    const ol = outline(g.cut, g.L, g.W, 48);
    const r = pr.dia / 2;
    const surfY = -((g.depth ?? GEM_DEFAULTS.depth) - st.top);       // surface height in the local frame
    const angs = pr.count === 2 ? [Math.PI / 2, -Math.PI / 2] : prongAngles(g.cut, pr.count);
    for (const a of angs) {
      const rp = rimPoint(ol, a), rr = Math.hypot(rp[0], rp[1]) || 1;
      const k = (rr + r - pr.overlap) / rr;
      const x = rp[0] * k, z = rp[1] * k;
      const tipY = st.top * 0.35 + pr.height;
      const t = tube([V(x, surfY - 0.6, z), V(x, (surfY + tipY) / 2, z), V(x * 0.99, tipY, z * 0.99)], r, { segments: 8, radial: 10 });
      t.applyMatrix4(M); prongs.push(t);
      if (pr.tip !== 'flat') { const b = sphere(V(x * 0.97, tipY + r * 0.2, z * 0.97), r * (pr.tip === 'bead' ? 1.12 : 1.0), 10); b.applyMatrix4(M); prongs.push(b); }
    }
  }
  const c = { ...GEM_DEFAULTS.cutter, ...(g.cutter || {}) };
  const cutter = c.on ? cutterGeometry(g.cut, g.L, g.W, c, st).applyMatrix4(M) : null;
  const center = new THREE.Vector3().setFromMatrixPosition(M);
  return { stone, prongs, cutter, center, r: Math.max(g.L, g.W) / 2, ct: caratFromDims(g.cut, g.L, g.W, g.gem) };
}

/** Add placed gems to a built model (called by the engine before booleans). */
export function addPlacedGems(model, gems) {
  if (!gems?.length) return;
  const stones = [], prongs = [], cutters = [];
  for (const g of gems) {
    const b = buildPlacedGem(g);
    stones.push(b.stone); prongs.push(...b.prongs); if (b.cutter) cutters.push(b.cutter);
  }
  // group stones by cut + size so the gem map and inventory stay readable
  const groups = new Map();
  gems.forEach((g, i) => { const k = `${g.cut} ${(+g.L).toFixed(2)}×${(+g.W).toFixed(2)} ${g.gem}`; (groups.get(k) || groups.set(k, { g, pieces: [] }).get(k)).pieces.push(stones[i]); });
  for (const [k, { g, pieces }] of groups) model.parts.push({ name: `Gems ${k} (${pieces.length})`, layer: 'Stones::Placed', kind: 'stone', gem: g.gem, pieces, placed: true });
  if (prongs.length) model.parts.push({ name: `Placed prongs (${prongs.length})`, layer: 'Head::Placed prongs', kind: 'metal', pieces: prongs, noGemCut: true });
  if (cutters.length) model.cutters.push({ type: 'gemcut', target: '*', geometry: cutters });
  model.meta.placedGems = { count: gems.length, ct: gems.reduce((s, g) => s + caratFromDims(g.cut, g.L, g.W, g.gem), 0) };
}

/** Evenly spaced gems on a straight segment A→B (projected later to the surface). */
export function rowPositions(A, B, size, gap) {
  const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B);
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.floor((len + gap) / (size + gap)));
  const span = n * size + (n - 1) * gap;
  const start = (len - span) / 2 + size / 2;
  const dir = b.clone().sub(a).normalize();
  return Array.from({ length: n }, (_, i) => a.clone().addScaledVector(dir, start + i * (size + gap)));
}

/**
 * Compact / relax placed gems to a target girdle gap. project(p) → { p, n } snaps a point onto the metal surface.
 * Pairs closer than target are pushed apart, pairs a little further are pulled together (compact pavé).
 */
export function compactGems(gems, target, project, iterations = 90) {
  const P = gems.map((g) => new THREE.Vector3(...g.p));
  const N = gems.map((g) => new THREE.Vector3(...g.n).normalize());
  const R = gems.map((g) => Math.max(g.L, g.W) / 2);
  // girdle centres sit below the surface (table `depth` above it): measure gaps there, as the inventory does
  const lift = gems.map((g) => (g.depth ?? GEM_DEFAULTS.depth) - stoneGeometry(g.cut, g.L, g.W, { N: 8 }).top);
  const Q = (i) => P[i].clone().addScaledVector(N[i], lift[i]);
  const gapOf = (i, j) => Q(i).distanceTo(Q(j)) - R[i] - R[j];
  for (let it = 0; it < iterations; it++) {
    const attractOnly = it < iterations - 40;                    // last passes only push apart (guarantees no overlap)
    // nearest neighbours by gap (attraction only along real neighbours — a row or a pavé field, not across it)
    const nn = P.map((_, i) => P.map((__, j) => (j === i ? null : [j, gapOf(i, j)])).filter(Boolean).sort((a, b) => a[1] - b[1]).slice(0, 2).map((x) => x[0]));
    const D = P.map(() => new THREE.Vector3());
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const d = Q(j).sub(Q(i));
      if (d.lengthSq() < 1e-8) d.set(Math.cos(i * 2.4), 0, Math.sin(i * 2.4)).multiplyScalar(1e-3);   // separate coincident gems
      const dist = d.length();
      const gap = dist - R[i] - R[j];
      const err = gap - target;                                  // >0 too far, <0 too close
      let f = 0;
      if (err < 0) f = err * 0.5;                                // always repel overlaps / too-tight pairs
      else if (attractOnly && (nn[i].includes(j) || nn[j].includes(i)) && gap < Math.max(R[i], R[j]) * 1.5) f = err * 0.15;
      if (!f) continue;
      d.multiplyScalar(f / dist);
      D[i].add(d); D[j].sub(d);
    }
    for (let i = 0; i < P.length; i++) { P[i].add(D[i]); const s = project(P[i]); if (s) { P[i].copy(s.p); N[i].copy(s.n); } }
  }
  return gems.map((g, i) => { const s = project(P[i]); return { ...g, p: P[i].toArray().map(r4), n: s ? s.n.toArray().map(r4) : g.n }; });
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** All gems in a model: [{ group, cut, L, W, gem, qty, ctEach, setting, centers:[{c, r}] }]. */
export function gemInventory(model, params) {
  const meta = model.meta, inv = [];
  const centersOf = (part) => part.pieces.map((g) => { g.computeBoundingBox(); const bb = g.boundingBox; return bb.getCenter(new THREE.Vector3()); });
  const pair = model.meta.pair ? 2 : 1;
  for (const part of model.parts) {
    if (part.kind !== 'stone') continue;
    let cut = 'round', L, W, gem = part.gem || 'diamond', setting = '';
    if (part.name === 'Center stone' && meta.stone) { cut = meta.stone.cut; L = meta.stone.L; W = meta.stone.W; setting = meta.headType; }
    else if (part.name.startsWith('Halo stones')) { L = W = meta.haloStone; setting = 'halo · shared beads'; }
    else if (part.name.startsWith('Accent stones')) { L = W = meta.accentSize; setting = meta.accentMode === 'shoulders' ? 'pavé' : meta.accentMode; }
    else if (part.name.startsWith('Side stones') && meta.side) { cut = meta.side.cut; L = meta.side.L; W = meta.side.W; setting = 'side · ' + (params.sideHead || 'prong'); }
    else if (part.placed) { const m = part.name.match(/Gems (\w+) ([\d.]+)×([\d.]+)/); if (m) { cut = m[1]; L = +m[2]; W = +m[3]; } setting = 'placed · ' + (params.gems?.find((g) => g.cut === cut && Math.abs(g.L - L) < 0.006)?.prongs?.count ? 'prongs' : 'bead/pavé'); }
    else { const bb = new THREE.Box3(); part.pieces.forEach((g) => { g.computeBoundingBox(); bb.union(g.boundingBox); }); const s = bb.getSize(new THREE.Vector3()); L = W = Math.max(s.x, s.z); }
    if (!L) continue;
    const ctEach = caratFromDims(cut, L, W, gem);
    const centers = centersOf(part).map((c) => ({ c, r: Math.max(L, W) / 2 }));
    inv.push({ group: part.name.replace(/ \(\d+\)$/, ''), part: part.name, cut, L, W, gem, qty: part.pieces.length * pair, ctEach, setting, centers });
  }
  return inv;
}

/** Neighbour gaps between all gems (girdle to girdle). */
export function gemGaps(inv, maxNeighbours = 3) {
  const all = inv.flatMap((g) => g.centers);
  const pairs = [];
  for (let i = 0; i < all.length; i++) {
    const near = [];
    for (let j = 0; j < all.length; j++) if (j !== i) near.push([j, all[i].c.distanceTo(all[j].c) - all[i].r - all[j].r]);
    near.sort((a, b) => a[1] - b[1]);
    for (const [j, gap] of near.slice(0, maxNeighbours)) if (j > i && gap < Math.max(all[i].r, all[j].r) * 1.2 + 0.5) pairs.push({ a: all[i].c, b: all[j].c, gap });
  }
  return pairs;
}

export { stoneDimsFromCarat, CUTS };
