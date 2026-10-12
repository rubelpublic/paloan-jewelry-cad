// Text jewelry: name necklaces / tags, signet monograms, inside-ring engraving.
import * as THREE from 'three';
import { getFont, textShapes } from '../fonts.js';
import { V, torus, orientOutward, merge, sphere } from './util.js';

export const NAME_DEFAULTS = {
  text: 'Amelia', font: 'pacifico', letterHeight: 9, thickness: 1.2, spacing: 0, bar: 'none', barHeight: 1.2, plateMargin: 1.6,
  bail: 'ends', bailInner: 3.0, bailWire: 0.9, stoneDot: false, dots: 'remove',
};

const shapeArea = (pts) => Math.abs(THREE.ShapeUtils.area(pts));
const perim = (pts) => pts.reduce((s, p, i) => s + p.distanceTo(pts[(i + 1) % pts.length]), 0);

/** Extrude shapes (with holes) to closed solids between z0 and z1. */
export function extrudeShapes(shapes, z0, z1, bevel = 0.12) {
  const depth = z1 - z0, b = Math.min(bevel, depth * 0.3);
  return shapes.map((s) => {
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.05, depth - 2 * b), bevelEnabled: b > 0.01, bevelThickness: b, bevelSize: b * 0.8, bevelOffset: -b * 0.8, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, z0 + b);
    return g;
  });
}

/** Stroke metrics + connectivity of a set of text shapes (and optional connector rectangles). */
export function textMetrics(shapes, extraBoxes = []) {
  const samples = shapes.map((s) => s.getPoints(10));
  let minStroke = Infinity;
  shapes.forEach((s, i) => {
    const holes = s.holes.map((h) => h.getPoints(10));
    const A = shapeArea(samples[i]) - holes.reduce((a, h) => a + shapeArea(h), 0);
    const Pm = perim(samples[i]) + holes.reduce((a, h) => a + perim(h), 0);
    if (A > 0.01) minStroke = Math.min(minStroke, (2 * A) / Pm);
  });
  // connectivity: shapes touch if any sample point is inside / within 0.08 mm of another shape
  const n = shapes.length + extraBoxes.length, parent = [...Array(n).keys()];
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const boxes = samples.map((pts) => new THREE.Box2().setFromPoints(pts)).concat(extraBoxes);
  const near = (pts, poly) => pts.some((p) => pointInPoly(p, poly) || poly.some((q) => q.distanceTo(p) < 0.12));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!boxes[i].clone().expandByScalar(0.1).intersectsBox(boxes[j])) continue;
    let touch;
    if (i >= shapes.length || j >= shapes.length) touch = true;          // connector bar / plate overlaps the letter box
    else touch = near(samples[i], samples[j]) || near(samples[j], samples[i]);
    if (touch) parent[find(i)] = find(j);
  }
  const groupOf = [...Array(n).keys()].map(find);
  const groups = new Set(groupOf).size;
  return { minStroke, groups, groupOf, boxes };
}
function pointInPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
function roundRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Text shapes centred on the origin, scaled so capital/x-height ≈ letterHeight. */
export function layoutText(font, text, letterHeight, spacing = 0) {
  const size = letterHeight / 0.72;                                   // em size whose cap height ≈ letterHeight
  const shapes = textShapes(font, text || ' ', size, spacing);
  const box = new THREE.Box2();
  shapes.forEach((s) => s.getPoints(6).forEach((p) => box.expandByPoint(p)));
  if (box.isEmpty()) box.set(new THREE.Vector2(), new THREE.Vector2(1, 1));
  const c = box.getCenter(new THREE.Vector2());
  const move = (path) => path.curves.forEach((cv) => { for (const k of ['v0', 'v1', 'v2', 'v3']) if (cv[k]) { cv[k].x -= c.x; cv[k].y -= c.y; } });
  shapes.forEach((s) => { move(s); s.holes.forEach(move); });
  const size2 = box.getSize(new THREE.Vector2());
  return { shapes, width: size2.x, height: size2.y };
}

export function buildName(P) {
  const p = { ...NAME_DEFAULTS, ...P };
  const font = getFont(p.font);
  const parts = [], cutters = [];
  const meta = { type: 'name', thickness: p.thickness, minThickness: p.thickness, letterHeight: p.letterHeight, text: p.text, font: p.font, fontReady: !!font };
  if (!font) return { parts, cutters, meta, pendingFont: p.font };
  const L = layoutText(font, p.text, p.letterHeight, p.spacing);
  // floating i/j dots and accents: tiny shapes not touching the rest of the word
  if (p.dots === 'remove' && L.shapes.length > 1) {
    const m0 = textMetrics(L.shapes);
    const size = {};
    m0.groupOf.slice(0, L.shapes.length).forEach((g, i) => { size[g] = (size[g] || 0) + 1; });
    const main = Object.keys(size).sort((a, b) => size[b] - size[a])[0];
    const keep = L.shapes.filter((s, i) => String(m0.groupOf[i]) === main || m0.boxes[i].getSize(new THREE.Vector2()).y > p.letterHeight * 0.45);
    meta.removedDots = L.shapes.length - keep.length;
    L.shapes = keep;
  }
  const t = p.thickness;
  const extraBoxes = [];
  const pieces = extrudeShapes(L.shapes, -t / 2, t / 2);
  const outlines = L.shapes.map((s) => ({ outer: s.getPoints(8).map((v) => [v.x, v.y]), holes: s.holes.map((h) => h.getPoints(8).map((v) => [v.x, v.y])), z0: -t / 2, z1: t / 2 }));
  parts.push({ name: `Letters “${p.text}”`, layer: 'Body::Letters', kind: 'metal', pieces });
  const halfW = L.width / 2, halfH = L.height / 2;
  if (p.bar === 'underline') {
    const y0 = -halfH - p.barHeight * 0.35, y1 = y0 + p.barHeight;
    const bar = roundRect(-halfW - 0.4, y0, halfW + 0.4, y1, p.barHeight / 2);
    parts.push({ name: 'Underline bar', layer: 'Body::Connector', kind: 'metal', pieces: extrudeShapes([bar], -t / 2, t / 2) });
    extraBoxes.push(new THREE.Box2(new THREE.Vector2(-halfW - 0.4, y0), new THREE.Vector2(halfW + 0.4, y1)));
    outlines.push({ outer: bar.getPoints(6).map((v) => [v.x, v.y]), holes: [], z0: -t / 2, z1: t / 2 });
    meta.barHeight = p.barHeight;
  } else if (p.bar === 'plate') {
    const m = p.plateMargin;
    const plate = roundRect(-halfW - m, -halfH - m, halfW + m, halfH + m, m * 1.2);
    const pt = Math.max(0.8, t * 0.7);
    parts.push({ name: 'Back plate', layer: 'Body::Plate', kind: 'metal', pieces: extrudeShapes([plate], -t / 2 - pt + 0.1, -t / 2 + 0.1) });
    extraBoxes.push(new THREE.Box2(new THREE.Vector2(-halfW - m, -halfH - m), new THREE.Vector2(halfW + m, halfH + m)));
    outlines.push({ outer: plate.getPoints(6).map((v) => [v.x, v.y]), holes: [], z0: -t / 2 - pt + 0.1, z1: -t / 2 + 0.1 });
    meta.plateThickness = pt;
  }
  const M = textMetrics(L.shapes, extraBoxes);
  meta.minStroke = M.minStroke; meta.groups = M.groups; meta.width = L.width; meta.height = L.height;
  // bails
  if (p.bail !== 'none') {
    const R = p.bailInner / 2 + p.bailWire / 2;
    const ends = p.bail === 'ends';
    const ring = (x, y) => { const g = torus(R, p.bailWire / 2, 'z', 32); g.translate(x, y, 0); return g; };
    const loops = [];
    if (ends) {
      // attach to the outermost letter strokes at mid height
      const leftPts = L.shapes.flatMap((s) => s.getPoints(6)).filter((v) => Math.abs(v.y) < halfH * 0.6);
      const xl = Math.min(...leftPts.map((v) => v.x)), xr = Math.max(...leftPts.map((v) => v.x));
      const yl = leftPts.find((v) => v.x === xl)?.y || 0, yr = leftPts.find((v) => v.x === xr)?.y || 0;
      loops.push(ring(xl - R + p.bailWire * 0.6, yl), ring(xr + R - p.bailWire * 0.6, yr));
    } else {
      const g = torus(R, p.bailWire / 2, 'x', 32); g.translate(0, halfH + R - p.bailWire * 0.4, 0); loops.push(g);
    }
    parts.push({ name: ends ? 'Chain loops (2)' : 'Bail', layer: 'Findings::Bail', kind: 'metal', pieces: loops });
    meta.bailInner = p.bailInner; meta.bailWire = p.bailWire;
  }
  if (p.stoneDot) {
    const d = Math.max(1.2, p.letterHeight * 0.18);
    parts.push({ name: 'Accent bezel', layer: 'Head::Bezel', kind: 'metal', pieces: [sphere(V(halfW + d, halfH * 0.6, 0), d * 0.75, 16)] });
  }
  meta.export = { outlines };
  return { parts, cutters, meta };
}

/** Monogram / initials for a signet face (pieces to emboss or a cutter to engrave). topY = plate top, maxW/maxL = face size. */
export function monogram({ text, fontKey, maxW, maxL, topY, depth, mode }) {
  const font = getFont(fontKey);
  if (!font || !text) return null;
  const L = layoutText(font, text, 10, 0);
  const s = Math.min((maxW * 0.78) / L.width, (maxL * 0.78) / L.height);
  const shapes = L.shapes;
  const geos = extrudeShapes(shapes, 0, 1, 0);
  const out = [];
  for (const g of geos) {
    g.scale(s, s, mode === 'engrave' ? depth + 0.6 : depth + 0.05);
    g.rotateX(-Math.PI / 2);                                 // text +Z → +Y, text up → −Z
    if (mode === 'engrave') { g.translate(0, topY - depth, 0); } else g.translate(0, topY - 0.05, 0);
    orientOutward(g); g.computeVertexNormals();
    out.push(g);
  }
  return { pieces: out, scale: s, minStroke: textMetrics(shapes).minStroke * s };
}

/** Inside-ring engraving cutter: text wrapped onto the finger surface at the bottom of the shank. */
export function engravingCutter({ text, fontKey, size, depth, Rin, axialOffset = 0 }) {
  const font = getFont(fontKey);
  if (!font || !text) return null;
  const L = layoutText(font, text, size, size * 0.06);
  const geos = extrudeShapes(L.shapes, 0, depth + 0.35, 0);
  const g = merge(geos, 0.6);
  const pos = g.attributes.position;
  const arc = L.width / Rin;
  if (arc > Math.PI * 1.6) return { tooLong: true };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = Math.PI - x / Rin;                             // read left→right from inside, centred at the bottom
    const r = Rin - 0.35 + z;                                 // 0.35 mm inside the finger hole → depth into metal
    pos.setXYZ(i, Math.sin(th) * r, Math.cos(th) * r, y + axialOffset);
  }
  pos.needsUpdate = true;
  orientOutward(g);
  g.computeVertexNormals();
  return { geometry: g, arcDeg: (arc * 180) / Math.PI, width: L.width, minStroke: textMetrics(L.shapes).minStroke };
}
