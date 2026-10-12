// Image relief jewelry: heightfield solids (charms, medallions, coins, signet faces) from the image store.
import * as THREE from 'three';
import { imageStore, sampleField } from '../image3d.js';
import { V, orientOutward, torus, clamp } from './util.js';

/**
 * Watertight heightfield solid on a cols × rows grid.
 * inside(i, j) → cell is solid; top(i, j) → z of grid vertex (i in 0..cols, j in 0..rows); x(i), y(j) → mm.
 */
export function heightfieldSolid({ cols, rows, inside, top, X, Y, z0 = 0, smoothEdges = 4 }) {
  const pos = [], idx = [];
  const topId = new Int32Array((cols + 1) * (rows + 1)).fill(-1), botId = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  const vk = (i, j) => j * (cols + 1) + i;
  const T = (i, j) => { const k = vk(i, j); if (topId[k] < 0) { topId[k] = pos.length / 3; pos.push(X(i), Y(j), top(i, j)); } return topId[k]; };
  const B = (i, j) => { const k = vk(i, j); if (botId[k] < 0) { botId[k] = pos.length / 3; pos.push(X(i), Y(j), z0); } return botId[k]; };
  const ins = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && inside(i, j);
  const P = (id) => new THREE.Vector3(pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]);
  const edges = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!inside(i, j)) continue;
    const a = T(i, j), b = T(i + 1, j), c = T(i + 1, j + 1), d = T(i, j + 1);
    idx.push(a, c, b, a, d, c);                       // faces +z (rows go towards −y)
    const a2 = B(i, j), b2 = B(i + 1, j), c2 = B(i + 1, j + 1), d2 = B(i, j + 1);
    idx.push(a2, b2, c2, a2, c2, d2);                 // faces −z
    const walls = [];
    if (!ins(i - 1, j)) walls.push([[i, j], [i, j + 1], [-1, 0]]);
    if (!ins(i + 1, j)) walls.push([[i + 1, j], [i + 1, j + 1], [1, 0]]);
    if (!ins(i, j - 1)) walls.push([[i, j], [i + 1, j], [0, 1]]);
    if (!ins(i, j + 1)) walls.push([[i, j + 1], [i + 1, j + 1], [0, -1]]);
    for (const [[pi, pj], [qi, qj], [ox, oy]] of walls) {
      edges.push([vk(pi, pj), vk(qi, qj)]);
      const p = T(pi, pj), q = T(qi, qj), p2 = B(pi, pj), q2 = B(qi, qj);
      const n = P(q).sub(P(p)).cross(P(q2).sub(P(p)));
      if (n.x * ox + n.y * oy >= 0) idx.push(p, q, q2, p, q2, p2); else idx.push(p, q2, q, p, p2, q2);
    }
  }
  // relax the stair-stepped outline: move boundary grid vertices towards their two boundary neighbours
  if (smoothEdges > 0 && edges.length) {
    const nb = new Map();
    for (const [a, b] of edges) { (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); }
    const xy = new Map();
    for (const k of nb.keys()) { const i = k % (cols + 1), j = (k - i) / (cols + 1); xy.set(k, [X(i), Y(j)]); }
    for (let it = 0; it < smoothEdges; it++) {
      const nxt = new Map();
      for (const [k, n] of nb) {
        const c = xy.get(k);
        if (n.length !== 2) { nxt.set(k, c); continue; }
        const a = xy.get(n[0]), b = xy.get(n[1]);
        nxt.set(k, [c[0] * 0.5 + (a[0] + b[0]) * 0.25, c[1] * 0.5 + (a[1] + b[1]) * 0.25]);
      }
      for (const [k, v] of nxt) xy.set(k, v);
    }
    for (const [k, [x, y]] of xy) for (const id of [topId[k], botId[k]]) if (id >= 0) { pos[id * 3] = x; pos[id * 3 + 1] = y; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  orientOutward(g);
  g.computeVertexNormals();
  return g;
}

/** Shape masks in normalised coordinates (u, v ∈ [0,1], v down). */
export function shapeTest(shape) {
  switch (shape) {
    case 'circle': case 'oval': return (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
    case 'square': return (u, v) => { const r = 0.12, dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - r)), dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - r)); return dx * dx + dy * dy <= r * r; };
    case 'cushion': return (u, v) => Math.abs(2 * u - 1) ** 4 + Math.abs(2 * v - 1) ** 4 <= 1;
    case 'octagon': return (u, v) => { const x = Math.abs(u - 0.5), y = Math.abs(v - 0.5); return x <= 0.5 && y <= 0.5 && x + y <= 0.72; };
    case 'hexagon': return (u, v) => { const x = Math.abs(u - 0.5) * 2, y = Math.abs(v - 0.5) * 2; return y <= 1 && x <= 0.866 && y + x * 0.577 <= 1; };
    case 'shield': return (u, v) => { const x = Math.abs(u - 0.5) * 2; return v <= 0.55 ? x <= 1 : x <= Math.sqrt(Math.max(0, 1 - ((v - 0.55) / 0.45) ** 2)); };
    case 'heart': return (u, v) => { const x = (u - 0.5) * 2.4, y = (0.45 - v) * 2.4; return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0; };
    default: return null;                              // 'image' → use the image mask
  }
}

/** Chamfer distance (in cells) from each inside cell to the outside. */
function distanceToOutside(cols, rows, inside) {
  const INF = 1e9, D = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) D[j * cols + i] = inside(i, j) ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : D[j * cols + i]);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414);
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414);
  }
  return D;
}

/** Procedural demo motif (rose) used until the user uploads an image. */
function demoField(u, v) {
  const x = (u - 0.5) * 2, y = (v - 0.5) * 2, r = Math.hypot(x, y), a = Math.atan2(y, x);
  if (r > 0.95) return { m: 0, h: 0 };
  const petals = 0.5 + 0.5 * Math.cos(5 * a + r * 6);
  const h = Math.max(0, 1 - r) * (0.55 + 0.45 * petals) * (r < 0.18 ? 1.2 : 1);
  return { m: 1, h: Math.min(1, h) };
}

/**
 * Relief surface over a rectangle (width × height mm) for a given shape mask.
 * mode: 'emboss' (bright = raised) | 'engrave' (bright = cut) | 'flat'.
 * Returns geometry with z from 0 (back) to base + depth (front, +Z).
 */
export function reliefGeometry({ width, height, shape = 'image', base = 1.2, depth = 0.6, mode = 'emboss', rim = 0, rimHeight = 0.6, res = 150, imageInShape = true, intersect = false }) {
  const useImg = !!imageStore.mask;
  const aspect = height / width;
  const cols = Math.max(8, Math.round(aspect > 1 ? res / aspect : res)), rows = Math.max(8, Math.round(aspect > 1 ? res : res * aspect));
  const test = shapeTest(shape);
  const field = (u, v) => (useImg ? sampleField(u, v) : demoField(u, v));
  const cellIn = (i, j) => {
    const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
    if (test && intersect) return test(u, v) && field(u, v).m === 1;
    return test ? test(u, v) : field(u, v).m === 1;
  };
  const cache = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cache[j * cols + i] = cellIn(i, j) ? 1 : 0;
  const inside = (i, j) => cache[j * cols + i] === 1;
  const D = rim > 0 ? distanceToOutside(cols, rows, inside) : null;
  const cell = width / cols;
  const rimCells = rim / cell;
  // vertex height = max of the adjacent inside cells' heights (keeps rims crisp)
  const cellH = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!inside(i, j)) continue;
    const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
    const f = field(u, v);
    let hgt = test && imageInShape ? (f.m ? f.h : 0) : f.h;
    let z = mode === 'flat' ? 0 : mode === 'engrave' ? depth * (1 - hgt) : depth * hgt;
    if (D && D[j * cols + i] <= rimCells) z = Math.max(z, mode === 'engrave' ? depth : rimHeight);
    cellH[j * cols + i] = base + z;
  }
  const top = (i, j) => {
    let z = 0, n = 0;
    for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < cols && b < rows && inside(a, b)) { z += cellH[b * cols + a]; n++; }
    return n ? z / n : base;
  };
  const g = heightfieldSolid({ cols, rows, inside, top, X: (i) => (i / cols - 0.5) * width, Y: (j) => (0.5 - j / rows) * height });
  return { geometry: g, cols, rows, cell, inside, cellH };
}

export const RELIEF_DEFAULTS = {
  shape: 'image', width: 22, height: 22, lockAspect: true, base: 1.2, depth: 0.7, mode: 'emboss', rim: 0, rimHeight: 0.7, res: 150,
  bail: 'loop', bailInner: 3.6, bailWire: 1.1, backRecess: false,
};

export function buildRelief(P) {
  const p = { ...RELIEF_DEFAULTS, ...P };
  let H = p.height;
  if (p.lockAspect && p.shape === 'image' && imageStore.mask) H = p.width * imageStore.h / imageStore.w;
  if (p.shape === 'circle' || p.shape === 'square' || p.shape === 'octagon' || p.shape === 'cushion') H = p.lockAspect ? p.width : H;
  const r = reliefGeometry({ width: p.width, height: H, shape: p.shape, base: p.base, depth: p.depth, mode: p.mode, rim: p.rim, rimHeight: p.rimHeight, res: p.res });
  r.geometry.translate(0, 0, -p.base / 2);
  const parts = [{ name: 'Relief body', layer: 'Body::Relief', kind: 'metal', pieces: [r.geometry], csgTarget: 'body' }];
  const cutters = [];
  const meta = { type: 'relief', width: p.width, height: H, thickness: p.base + p.depth, base: p.base, reliefDepth: p.mode === 'flat' ? 0 : p.depth, cell: r.cell, minThickness: p.base, hasImage: !!imageStore.mask };
  // highest solid point near the centre column for the bail
  let topY = -Infinity;
  for (let j = 0; j < r.rows && topY === -Infinity; j++) for (let i = Math.floor(r.cols * 0.4); i < Math.ceil(r.cols * 0.6); i++) if (r.inside(i, j)) { topY = (0.5 - j / r.rows) * H; break; }
  if (topY === -Infinity) topY = H / 2;
  if (p.bail !== 'none') {
    const R = p.bailInner / 2 + p.bailWire / 2;
    const g = torus(R, p.bailWire / 2, 'x', 40);
    if (p.bail === 'hidden') g.translate(0, topY - R * 0.9, -p.base / 2 - R + p.bailWire * 0.6);
    else g.translate(0, topY + R - p.bailWire * 0.35, 0);
    parts.push({ name: 'Bail', layer: 'Findings::Bail', kind: 'metal', pieces: [g] });
    meta.bailInner = p.bailInner; meta.bailWire = p.bailWire;
  }
  if (p.backRecess && p.base > 1.0) {
    // shallow recess in the back leaving a 1 mm frame: weight saving for big medallions
    const inner = reliefGeometry({ width: p.width - 2.4, height: H - 2.4, shape: p.shape, base: p.base - 0.6, depth: 0, mode: 'flat', res: Math.min(p.res, 110) });
    inner.geometry.translate(0, 0, -p.base / 2 - 0.01);
    cutters.push({ type: 'hollow', target: 'body', geometry: inner.geometry });
    meta.hollowWall = 0.6; meta.hollowRail = 1.2; meta.hollowDepth = p.base - 0.6;
  }
  return { parts, cutters, meta };
}

/** Signet face: emboss pieces or an engrave cutter for a plate whose top face is at y = topY (normal +Y). */
export function signetFace({ shape, w, l, topY, depth, mode, res = 120 }) {
  const r = mode === 'engrave'
    ? reliefGeometry({ width: w, height: l, shape, base: 1.05, depth, mode: 'emboss', res, intersect: true })   // cut only the motif, ≥ 0.05 mm deep
    : reliefGeometry({ width: w, height: l, shape, base: 0.05, depth, mode: 'emboss', res });
  const g = r.geometry;
  // relief +Z → ring +Y, relief +Y (image up) → ring −Z (towards the finger tip, readable from above)
  g.rotateX(-Math.PI / 2);
  if (mode === 'engrave') {
    // mirror height so the cutter hangs down into the plate from just above the top face
    g.scale(1, -1, 1);
    g.translate(0, topY + 1, 0);
  } else g.translate(0, topY - 0.05, 0);
  orientOutward(g);
  g.computeVertexNormals();
  return g;
}
export { clamp, V };
