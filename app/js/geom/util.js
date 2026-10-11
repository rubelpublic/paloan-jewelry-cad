// Low-level geometry builders. Everything returns closed (watertight) BufferGeometry
// so volumes, weights and boolean operations stay valid.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const DEG = Math.PI / 180;

/* ---------- signed volume / area ---------- */
export function signedVolume(geo) {
  const p = geo.attributes.position.array, idx = geo.index ? geo.index.array : null;
  const n = idx ? idx.length : p.length / 3;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
       - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
       + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
export function surfaceArea(geo) {
  const p = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : p.count, a = V(), b = V(), c = V();
  let s = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;
}
/** Flip triangle winding if the solid is inside-out. */
export function orientOutward(geo) {
  if (signedVolume(geo) < 0) {
    if (geo.index) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      geo.index.needsUpdate = true;
    } else {
      const p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      geo.attributes.position.needsUpdate = true;
    }
  }
  return geo;
}

/* ---------- noise ---------- */
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
/** Worley (cellular) distance — gives hammered/beaten dimples. Returns 0..~1 */
export function worley(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const cx = xi + i + hash2(xi + i, yi + j), cy = yi + j + hash2(yi + j + 17.3, xi + i + 3.1);
    d = Math.min(d, Math.hypot(x - cx, y - cy));
  }
  return d;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}

/* ---------- profiles ---------- */
/**
 * Superellipse cross-section. Returns M points [a, b]:
 *  a = offset along the outward normal (0 = inner surface, t = outer surface)
 *  b = offset along the axial (binormal) direction.
 * nOut/nIn control the outer and inner halves (1 = diamond, 2 = ellipse, 8+ = flat).
 */
export function superProfile(w, t, nOut, nIn, M = 40) {
  const pts = [];
  for (let i = 0; i < M; i++) {
    const phi = (i / M) * Math.PI * 2;
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = s >= 0 ? nOut : nIn;
    const e = 2 / n;
    const b = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
    const a = t / 2 + (t / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
    pts.push([a, b]);
  }
  return pts;
}
export const PROFILES = {
  comfort: { nOut: 2.2, nIn: 3.2, label: 'Comfort fit (court)' },
  dshape:  { nOut: 2.0, nIn: 14,  label: 'D-shape' },
  flat:    { nOut: 9,   nIn: 9,   label: 'Flat / square edge' },
  knife:   { nOut: 1.0, nIn: 6,   label: 'Knife edge' },
  round:   { nOut: 2.0, nIn: 2.0, label: 'Round wire' },
  square:  { nOut: 16,  nIn: 16,  label: 'Square' },
  dome:    { nOut: 2.6, nIn: 10,  label: 'High dome' },
};

/* ---------- sweeps ---------- */
/**
 * Generic sweep of a varying cross-section along a parametric path.
 * frame(u) -> { p, n, b } point, outward normal, axial binormal (unit vectors)
 * profile(u) -> [[a,b]...] (M points, same M for every station)
 * displace(u, a, b, j) -> extra offset along n (textures). Optional.
 */
export function sweep({ frame, profile, stations = 192, closed = true, displace = null }) {
  const S = closed ? stations : stations + 1;
  const pos = [];
  let M = 0;
  for (let i = 0; i < S; i++) {
    const u = i / stations;
    const { p, n, b } = frame(u);
    const prof = profile(u);
    M = prof.length;
    for (let j = 0; j < M; j++) {
      let [a, bb] = prof[j];
      if (displace) a += displace(u, a, bb, j);
      pos.push(p.x + n.x * a + b.x * bb, p.y + n.y * a + b.y * bb, p.z + n.z * a + b.z * bb);
    }
  }
  const idx = [];
  const rows = closed ? S : S - 1;
  for (let i = 0; i < rows; i++) {
    const i2 = (i + 1) % S;
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const a = i * M + j, b = i * M + j2, c = i2 * M + j, d = i2 * M + j2;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!closed) {
    // fan caps from centroid, wound to match the side walls (cap normal must point away from the neighbour ring)
    const cen = (ring) => {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < M; j++) { const k = (ring * M + j) * 3; cx += pos[k]; cy += pos[k + 1]; cz += pos[k + 2]; }
      return V(cx / M, cy / M, cz / M);
    };
    const P = (i) => V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    // side-wall orientation sample: normal of the first quad vs. direction from the sweep axis
    const c0 = cen(0), c1 = cen(1);
    const sideN = P(M).sub(P(0)).cross(P(1).sub(P(0)));            // triangle (a, c, b) of the first quad
    const radial = P(0).sub(c0);
    const sidesOut = sideN.dot(radial) > 0;
    for (const [ring, nb] of [[0, 1], [S - 1, S - 2]]) {
      const c = cen(ring), outward = c.clone().sub(cen(nb));
      const ci = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      const tn = P(ring * M).sub(c).cross(P(ring * M + 1).sub(c));   // normal of (ci, a, b)
      const keep = (tn.dot(outward) > 0) === sidesOut;
      for (let j = 0; j < M; j++) {
        const a = ring * M + j, b = ring * M + (j + 1) % M;
        if (keep) idx.push(ci, a, b); else idx.push(ci, b, a);
      }
    }
    void c1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  orientOutward(g);
  g.computeVertexNormals();
  return g;
}

/** Frame for a ring/bangle path lying in the XY plane (finger axis = Z). θ=0 at top (+Y). */
export function ellipseFrame(rx, ry, a0 = 0, a1 = Math.PI * 2) {
  return (u) => {
    const th = a0 + (a1 - a0) * u;
    const p = V(rx * Math.sin(th), ry * Math.cos(th), 0);
    const t = V(rx * Math.cos(th), -ry * Math.sin(th), 0).normalize();
    const n = V(-t.y, t.x, 0);                 // outward for clockwise-from-top traversal
    if (n.dot(p) < 0) n.negate();
    return { p, n, b: V(0, 0, 1), th };
  };
}

/** Closed or open planar path (array of Vector3 in XZ plane at y) frame, outward normal in-plane. */
export function polylineFrame(pts, closed = true) {
  const N = pts.length;
  const cen = pts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / N);
  return (u) => {
    const f = u * (closed ? N : N - 1);
    const i = Math.min(Math.floor(f), closed ? N - 1 : N - 2), t = f - i;
    const a = pts[(i) % N], b = pts[(i + 1) % N];
    const p = a.clone().lerp(b, t);
    const prev = pts[(i - 1 + N) % N], next = pts[(i + 2) % N];
    const ta = b.clone().sub(prev), tb = next.clone().sub(a);
    const tan = ta.lerp(tb, t).setY(0).normalize();
    const n = V(tan.z, 0, -tan.x);
    if (n.dot(p.clone().sub(cen).setY(0)) < 0) n.negate();
    return { p, n, b: V(0, 1, 0) };
  };
}

/** Round tube along a curve (CatmullRom through points), radius(t) taper, capped & watertight. */
export function tube(points, radius = 0.5, { closed = false, segments = 48, radial = 14, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  const frames = curve.computeFrenetFrames(segments, closed);
  const rf = typeof radius === 'function' ? radius : () => radius;
  const circle = (r) => Array.from({ length: radial }, (_, j) => {
    const a = (j / radial) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return sweep({
    stations: segments, closed,
    frame: (u) => ({ p: curve.getPointAt(Math.min(u, 1)), n: frames.normals[Math.min(Math.round(u * segments), segments - (closed ? 1 : 0))], b: frames.binormals[Math.min(Math.round(u * segments), segments - (closed ? 1 : 0))] }),
    profile: (u) => circle(rf(u)),
  });
}

/** Cone/spike from base centre along direction. Closed. */
export function spike(base, dir, height, rBase, rTip = 0, seg = 16) {
  const g = rTip > 0
    ? new THREE.CylinderGeometry(rTip, rBase, height, seg, 1, false)
    : new THREE.ConeGeometry(rBase, height, seg, 1, false);
  g.translate(0, height / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return g;
}
export function sphere(c, r, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));
  g.translate(c.x, c.y, c.z);
  return g;
}
export function torus(R, r, axis = 'x', seg = 48) {
  const g = new THREE.TorusGeometry(R, r, 14, seg);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  else if (axis === 'y') g.rotateX(Math.PI / 2);
  return g;
}

/** Merge several closed geometries (position only) into one, keep creased normals. */
export function merge(list, crease = 50 * DEG) {
  const clean = list.filter(Boolean).map((g) => {
    let h = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(h.attributes)) if (k !== 'position') h.deleteAttribute(k);
    return h;
  });
  if (!clean.length) return null;
  const m = clean.length === 1 ? clean[0] : mergeGeometries(clean, false);
  return toCreasedNormals(m, crease);
}

/** Point-in-polygon (2D, [x,y] arrays). */
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from point to polygon edges. */
export function distToPoly(pt, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    d = Math.min(d, Math.hypot(pt[0] - (ax + t * dx), pt[1] - (ay + t * dy)));
  }
  return d;
}
/** Offset a closed 2D polygon (CCW positive = outward). Simple miter offset, good for smooth outlines. */
export function offsetPoly(poly, d) {
  const N = poly.length;
  const area = poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % N]; return s + x * y2 - x2 * y; }, 0);
  const sgn = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + N) % N], b = poly[(i + 1) % N];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = ty * sgn, ny = -tx * sgn;              // outward normal
    return [p[0] + nx * d, p[1] + ny * d];
  });
}
export function polyArea(poly) {
  return Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
}
/** Resample a closed polygon to N points evenly by arc length. */
export function resample(poly, N) {
  const segs = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const L = segs.reduce((a, b) => a + b, 0);
  const out = [];
  let k = 0, acc = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / N) * L;
    while (acc + segs[k] < target && k < segs.length - 1) { acc += segs[k]; k++; }
    const t = segs[k] ? (target - acc) / segs[k] : 0;
    const p = poly[k], q = poly[(k + 1) % poly.length];
    out.push([lerp(p[0], q[0], t), lerp(p[1], q[1], t)]);
  }
  return out;
}

/** Extrude a 2D polygon ([x,y]) along +Z from z0 to z1. Closed solid. */
export function extrudePoly(poly, z0, z1) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  return g;
}

export { V };
