// Parametric pendant / charm / locket face. Front = +Z, top = +Y.
import * as THREE from 'three';
import { stoneDimsFromCarat } from '../data.js';
import { V, resample, offsetPoly, pointInPoly, distToPoly, polyArea, extrudePoly, tube, sphere, spike, torus, lerp, DEG } from './util.js';
import { buildHead, SETTING_DEFAULTS, headOptions } from './stone.js';

export const PENDANT_DEFAULTS = {
  shape: 'teardrop', height: 22, width: 15, thickness: 1.6, bevel: 0.35,
  bail: 'loop', bailInner: 3.6, bailWire: 1.1,
  headType: 'bezel', cut: 'round', gem: 'diamond', sizeMode: 'carat', carat: 0.5, stoneL: 5.1, stoneW: 5.1, prongCount: 4, prongStyle: 'round', stoneY: 0,
  openwork: 'none', openSize: 1.6, openBridge: 0.9, rim: 1.4,
  backHollow: false, frontWall: 0.7,
  spikes: 0, spikeLen: 2.0, spikeBase: 1.2, coils: 0, milgrain: false, customOutline: null,
  ...SETTING_DEFAULTS, petalLength: 6, petalWidth: 3,
};

/** 2D outline [x,y] centred at origin, height H, width W. */
export function pendantOutline(shape, H, W, custom) {
  const N = 160, pts = [];
  const h = H / 2, w = W / 2;
  const P = (fn) => { for (let i = 0; i < N; i++) pts.push(fn((i / N) * 2 * Math.PI)); };
  switch (shape) {
    case 'circle': P((t) => [Math.sin(t) * w, Math.cos(t) * w]); break;
    case 'oval': P((t) => [Math.sin(t) * w, Math.cos(t) * h]); break;
    case 'cushion': P((t) => { const s = Math.sin(t), c = Math.cos(t); return [w * Math.sign(s) * Math.abs(s) ** 0.5, h * Math.sign(c) * Math.abs(c) ** 0.5]; }); break;
    case 'hexagon': for (let k = 0; k < 6; k++) { const a = (k / 6) * 2 * Math.PI; pts.push([Math.sin(a) * w, Math.cos(a) * h]); } break;
    case 'heart': P((t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]); break;
    case 'teardrop': P((t) => [Math.sin(t) * Math.sin(t / 2), Math.cos(t)]); break;      // point at top
    case 'shield': P((t) => { const s = Math.sin(t), c = Math.cos(t); const y = c > 0 ? c ** 0.35 : -Math.pow(-c, 1.3); return [s * (c > 0 ? 1 : (1 + c * 0.55)), y]; }); break;
    case 'star': for (let k = 0; k < 10; k++) { const a = (k / 10) * 2 * Math.PI, r = k % 2 ? 0.45 : 1; pts.push([Math.sin(a) * r, Math.cos(a) * r]); } break;
    case 'crescent': {
      for (let i = 0; i <= 80; i++) { const t = Math.PI * 0.15 + (i / 80) * Math.PI * 1.7; pts.push([Math.sin(t), Math.cos(t)]); }
      for (let i = 80; i >= 0; i--) { const t = Math.PI * 0.15 + (i / 80) * Math.PI * 1.7; pts.push([Math.sin(t) * 0.78 + 0.32, Math.cos(t) * 0.8]); }
      break;
    }
    case 'cross': {
      const a = 0.2, arm = 0.62, raw = [[-a, 1], [a, 1], [a, arm * 0.55], [arm, arm * 0.55], [arm, arm * 0.15], [a, arm * 0.15], [a, -1], [-a, -1], [-a, arm * 0.15], [-arm, arm * 0.15], [-arm, arm * 0.55], [-a, arm * 0.55]];
      raw.forEach((p) => pts.push(p));
      break;
    }
    case 'gothic-cross': {   // cross with lancet-pointed arm ends
      const a = 0.17, arm = 0.66, cy = 0.35, k = 1.6 * a;
      [[0, 1], [a, 1 - k], [a, cy + a], [arm - k, cy + a], [arm, cy], [arm - k, cy - a], [a, cy - a], [a, -1 + k], [0, -1],
       [-a, -1 + k], [-a, cy - a], [-arm + k, cy - a], [-arm, cy], [-arm + k, cy + a], [-a, cy + a], [-a, 1 - k]].forEach((q) => pts.push(q));
      break;
    }
    case 'custom':
      if (custom && custom.length > 2) custom.forEach((p) => pts.push(p));
      else P((t) => [Math.sin(t), Math.cos(t)]);
      break;
    default: P((t) => [Math.sin(t) * w, Math.cos(t) * h]);
  }
  // normalise to H × W
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const keepAspect = shape === 'circle' || shape === 'star' || shape === 'cross' || shape === 'gothic-cross';
  let sx = W / (x1 - x0 || 1), sy = H / (y1 - y0 || 1);
  if (shape === 'circle') sx = sy = Math.min(W, H) / Math.max(x1 - x0, y1 - y0);
  let poly = pts.map(([x, y]) => [(x - (x0 + x1) / 2) * sx, (y - (y0 + y1) / 2) * sy]);
  // dedupe & resample (polygons with sharp corners keep their vertices)
  const sharp = ['hexagon', 'star', 'cross', 'gothic-cross'].includes(shape);
  if (!sharp) poly = resample(poly, 128);
  // make CCW
  const area = poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0);
  if (area < 0) poly.reverse();
  void keepAspect;
  return poly;
}

export function buildPendant(P) {
  const p = { ...PENDANT_DEFAULTS, ...P };
  const poly = pendantOutline(p.shape, p.height, p.width, p.customOutline);
  const parts = [], cutters = [], meta = { type: 'pendant', height: p.height, width: p.width, thickness: p.thickness, minThickness: p.thickness };
  const t = p.thickness;

  // ---------- body ----------
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const bev = Math.min(p.bevel, t * 0.4);
  const body = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * bev, bevelEnabled: bev > 0.01, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 3, curveSegments: 6 });
  body.translate(0, 0, -t / 2 + bev);
  parts.push({ name: 'Pendant body', layer: 'Body', kind: 'metal', pieces: [body], csgTarget: 'body', seatCut: true });

  const yTop = Math.max(...poly.map((q) => q[1]));
  const centre = poly.filter((q) => Math.abs(q[0]) < p.width * 0.08);
  const topPt = (centre.length ? centre : poly).reduce((a, b) => (b[1] > a[1] ? b : a));

  // ---------- centre stone ----------
  let stoneZone = null;
  if (p.headType !== 'none') {
    const d = p.sizeMode === 'mm' ? { L: p.stoneL, W: p.stoneW } : stoneDimsFromCarat(p.cut, p.carat, p.gem);
    meta.stone = { cut: p.cut, L: d.L, W: d.W, carat: p.carat, gem: p.gem };
    const girdleZ = t / 2 + 0.35;
    const head = buildHead({ ...headOptions(p), cut: p.cut, L: d.L, W: d.W, headType: p.headType === 'halo' ? 'halo' : p.headType, prongCount: p.prongCount, prongStyle: p.prongStyle, baseY: -(girdleZ - (-t / 2 + 0.25)), rails: 1, gem: p.gem });
    const place = (g) => { g.rotateX(Math.PI / 2); g.translate(0, p.stoneY, girdleZ); };
    head.parts.forEach((part) => { part.pieces.forEach(place); parts.push(part); });
    place(head.cutter);
    cutters.push({ type: 'seat', geometry: head.cutter });
    // open-back light hole through the body (smaller than the girdle so the stone still sits)
    const light = offsetPoly(head.stone.outline.map(([x, z]) => [x, -z]), -Math.min(0.6, Math.min(d.L, d.W) * 0.12));
    const lh = extrudePoly(light.map(([x, y]) => [x, y + p.stoneY]), -t, t);
    cutters.push({ type: 'light', target: 'body', geometry: lh });
    Object.assign(meta, head.meta);
    stoneZone = { y: p.stoneY, r: Math.max(d.L, d.W) / 2 + (p.headType === 'halo' ? head.meta.haloOuter : 1.0) + p.openBridge };
    meta.headHeight = girdleZ + head.stone.top + t / 2;
    meta.culetToBack = girdleZ + head.stone.culet + t / 2;   // >0 means the culet stays inside the body depth
  }

  // ---------- bail ----------
  if (p.bail !== 'none') {
    const R = p.bailInner / 2 + p.bailWire / 2;
    if (p.bail === 'hidden') {
      const g = torus(R, p.bailWire / 2, 'x', 40);
      g.translate(topPt[0], topPt[1] - R * 0.9, -t / 2 - R + p.bailWire * 0.6);
      parts.push({ name: 'Hidden bail', layer: 'Findings::Bail', kind: 'metal', pieces: [g] });
    } else {
      const g = torus(R, p.bailWire / 2, 'x', 40);
      g.translate(topPt[0], topPt[1] + R - p.bailWire * 0.35, 0);
      parts.push({ name: 'Bail loop', layer: 'Findings::Bail', kind: 'metal', pieces: [g] });
      if (p.bail === 'jumpring') {
        const j = torus(R * 1.05, p.bailWire / 2, 'y', 40);
        j.rotateZ(Math.PI / 2);
        j.translate(topPt[0], topPt[1] + 2 * R + R * 0.7, 0);
        parts.push({ name: 'Jump ring', layer: 'Findings::Bail', kind: 'metal', pieces: [j], loose: true });
      }
    }
    meta.bailInner = p.bailInner; meta.bailWire = p.bailWire;
  }

  // ---------- openwork ----------
  const inner = offsetPoly(poly, -p.rim);
  if (p.openwork !== 'none') {
    const holes = [];
    const s = p.openSize, pitch = s + p.openBridge;
    const ys = poly.map((q) => q[1]), xs = poly.map((q) => q[0]);
    const holeShape = (cx, cy) => {
      const out = [];
      const n = p.openwork === 'hex' ? 6 : p.openwork === 'diamond' ? 4 : 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI + (p.openwork === 'hex' ? Math.PI / 6 : 0);
        let r = s / 2;
        if (p.openwork === 'quatrefoil') r = (s / 2) * (0.7 + 0.3 * Math.abs(Math.cos(2 * a)));
        out.push([cx + Math.sin(a) * r * (p.openwork === 'arch' ? 0.62 : 1), cy + Math.cos(a) * r * (p.openwork === 'arch' && Math.cos(a) > 0 ? 1.3 : 1)]);
      }
      return out;
    };
    let row = 0;
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += pitch * (p.openwork === 'hex' ? 0.866 : 1), row++) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += pitch) {
        const cx = x + (row % 2 ? pitch / 2 : 0);
        const hs = holeShape(cx, y);
        if (!hs.every((q) => pointInPoly(q, inner))) continue;
        if (hs.some((q) => distToPoly(q, poly) < p.rim)) continue;
        if (stoneZone && Math.hypot(cx, y - stoneZone.y) < stoneZone.r + s / 2) continue;
        if (y > yTop - p.rim - s) continue;
        holes.push(extrudePoly(hs, -t, t));
      }
    }
    if (holes.length) cutters.push({ type: 'openwork', target: 'body', geometry: holes });
    meta.openBridge = p.openBridge; meta.openHole = s * (p.openwork === 'arch' ? 0.62 : 1); meta.openCount = holes.length; meta.openwork = p.openwork;
    meta.rim = p.rim;
  }

  // ---------- back hollow ----------
  if (p.backHollow) {
    const cav = extrudePoly(inner, -t, t / 2 - p.frontWall);
    cutters.push({ type: 'hollow', target: 'body', geometry: cav });
    meta.hollowWall = p.frontWall; meta.hollowRail = p.rim; meta.hollowDepth = t - p.frontWall;
  }

  // ---------- gothic perimeter spikes ----------
  if (p.spikes > 0) {
    const per = resample(poly, p.spikes), sp = [];
    per.forEach(([x, y], i) => {
      if (y > yTop - 2.5) return;
      const [x2, y2] = per[(i + 1) % per.length], [x0, y0] = per[(i - 1 + per.length) % per.length];
      const n = V(y2 - y0, -(x2 - x0), 0).normalize();
      if (n.x * x + n.y * y < 0) n.negate();
      sp.push(spike(V(x, y, 0).addScaledVector(n, -0.4), n, p.spikeLen + 0.4, p.spikeBase / 2, 0.06, 14));
    });
    parts.push({ name: `Spikes (${sp.length})`, layer: 'Ornament::Spikes', kind: 'metal', pieces: sp });
    meta.spikeBase = p.spikeBase; meta.spikeLen = p.spikeLen; meta.spikeCount = sp.length;
  }

  // ---------- organic coils on the face ----------
  if (p.coils > 0) {
    const cg = [];
    for (let k = 0; k < p.coils; k++) {
      const a0 = (k / p.coils) * 2 * Math.PI;
      const cx = Math.sin(a0) * p.width * 0.28, cy = Math.cos(a0) * p.height * 0.28 - 1;
      if (stoneZone && Math.hypot(cx, cy - stoneZone.y) < stoneZone.r) continue;
      const pts = [];
      const R0 = Math.min(p.width, p.height) * 0.16;
      for (let i = 0; i <= 50; i++) { const a = a0 + (i / 50) * 2.2 * Math.PI, r = R0 * (1 - i / 62); pts.push(V(cx + Math.sin(a) * r, cy + Math.cos(a) * r, t / 2 + 0.2)); }
      cg.push(tube(pts, (u) => lerp(0.5, 0.32, u), { segments: 90, radial: 10 }));
    }
    if (cg.length) parts.push({ name: 'Coils', layer: 'Ornament::Coils', kind: 'metal', pieces: cg });
    meta.coilWire = 0.64;
  }

  // ---------- milgrain ----------
  if (p.milgrain) {
    const ring = offsetPoly(poly, -0.35), per = ring.reduce((s, q, i) => s + Math.hypot(ring[(i + 1) % ring.length][0] - q[0], ring[(i + 1) % ring.length][1] - q[1]), 0);
    const beads = resample(ring, Math.floor(per / 0.55)).map(([x, y]) => sphere(V(x, y, t / 2), 0.2, 6));
    parts.push({ name: 'Milgrain', layer: 'Ornament::Milgrain', kind: 'metal', pieces: beads });
  }

  meta.outlineArea = polyArea(poly);
  meta.outline = poly;
  return { parts, cutters, meta };
}
