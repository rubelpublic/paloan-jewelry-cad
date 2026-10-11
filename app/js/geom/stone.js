// Gem outlines, faceted stone solids and setting heads (prong / bezel / halo).
// Local frame: girdle centre at origin, table facing +Y, length L along Z, width W along X.
import * as THREE from 'three';
import { CUTS, RULES } from '../data.js';
import { V, orientOutward, sweep, tube, sphere, spike, merge, resample, offsetPoly, clamp, lerp, DEG, polylineFrame } from './util.js';

/** Closed outline in the XZ plane as [x, z] (CCW seen from +Y), N points. */
export function outline(cut, L, W, N = 48) {
  const a = L / 2, b = W / 2;
  let pts = [];
  const lens = (ha, hb, z) => { const R = (ha * ha + hb * hb) / (2 * hb), c = R - hb; return Math.max(0, Math.sqrt(Math.max(0, R * R - z * z)) - c); };
  switch (cut) {
    case 'oval': case 'round':
      for (let i = 0; i < N; i++) { const t = (i / N) * 2 * Math.PI; pts.push([b * Math.sin(t), a * Math.cos(t)]); }
      break;
    case 'cushion': case 'princess': case 'asscher': case 'radiant': case 'emerald': {
      const n = cut === 'cushion' ? 4 : 30;
      const sq = [];
      for (let i = 0; i < 400; i++) {
        const t = (i / 400) * 2 * Math.PI, s = Math.sin(t), c = Math.cos(t);
        sq.push([b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)]);
      }
      let poly = sq;
      if (cut === 'emerald' || cut === 'asscher' || cut === 'radiant') {
        const k = Math.min(a, b) * (cut === 'radiant' ? 0.22 : 0.3);   // cut corners
        poly = sq.map(([x, z]) => {
          const ex = Math.abs(x) - (b - k), ez = Math.abs(z) - (a - k);
          if (ex > 0 && ez > 0 && ex + ez > k) { const s = k / (ex + ez); return [Math.sign(x) * (b - k + ex * s), Math.sign(z) * (a - k + ez * s)]; }
          return [x, z];
        });
      }
      pts = resample(poly, N);
      break;
    }
    case 'marquise':
      for (let i = 0; i < N; i++) {
        const z = a * Math.cos((i / N) * 2 * Math.PI);
        const side = i < N / 2 ? 1 : -1;
        pts.push([side * lens(a, b, z), z]);
      }
      pts = resample(pts, N);
      break;
    case 'pear': {
      // pointed end +Z. Round half radius b, pointed half length L - b.
      const ap = L - b;
      const right = []; for (let i = 0; i <= 100; i++) { const z = ap * (1 - i / 100); right.push([lens(ap, b, z), z]); }
      const round = []; for (let i = 0; i <= 100; i++) { const t = (i / 100) * Math.PI; round.push([b * Math.cos(t), -b * Math.sin(t)]); }
      const left = []; for (let i = 0; i <= 100; i++) { const z = ap * (i / 100); left.push([-lens(ap, b, z), z]); }
      const poly = [...right, ...round.slice(1), ...left.slice(1, -1)];
      const shift = (ap - b) / 2;
      pts = resample(poly.map(([x, z]) => [x, z - shift]), N);
      break;
    }
    case 'heart': {
      const raw = [];
      for (let i = 0; i < 400; i++) {
        const t = (i / 400) * 2 * Math.PI;
        raw.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
      }
      const xs = raw.map((p) => p[0]), zs = raw.map((p) => p[1]);
      const sx = W / (Math.max(...xs) - Math.min(...xs)), sz = L / (Math.max(...zs) - Math.min(...zs));
      const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
      pts = resample(raw.map(([x, z]) => [x * sx, (z - cz) * sz]), N);
      break;
    }
    case 'trillion': {
      const R = W / Math.sqrt(3), raw = [];
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * 2 * Math.PI, a1 = ((k + 1) / 3) * 2 * Math.PI;
        const p0 = [R * Math.sin(a0), R * Math.cos(a0)], p1 = [R * Math.sin(a1), R * Math.cos(a1)];
        for (let i = 0; i < 40; i++) {
          const t = i / 40, bulge = Math.sin(t * Math.PI) * R * 0.12;
          const mx = lerp(p0[0], p1[0], t), mz = lerp(p0[1], p1[1], t);
          const am = (a0 + a1) / 2;
          raw.push([mx + Math.sin(am) * bulge, mz + Math.cos(am) * bulge]);
        }
      }
      pts = resample(raw, N);
      break;
    }
    default:
      return outline('round', L, W, N);
  }
  return pts;
}

/** Faceted stone solid. Returns geometry with girdle centred at origin. */
export function stoneGeometry(cut, L, W, { N = 32 } = {}) {
  const c = CUTS[cut] || CUTS.round;
  const ol = outline(cut, L, W, N);
  const minD = Math.min(L, W);
  const crown = minD * (cut === 'emerald' || cut === 'asscher' ? 0.12 : 0.15);
  const gird = minD * 0.03;
  const pav = minD * c.depth - crown - gird;
  const rings = [
    { s: c.table, y: gird / 2 + crown },
    { s: lerp(c.table, 1, 0.55), y: gird / 2 + crown * 0.55 },
    { s: 1, y: gird / 2 },
    { s: 1, y: -gird / 2 },
    { s: 0.55, y: -gird / 2 - pav * 0.55 },
  ];
  const pos = [], idx = [];
  rings.forEach((r, k) => {
    const rot = k === 1 || k === 4 ? 0.5 : 0;  // twist alternate rings for facet look
    ol.forEach((_, i) => {
      const j = (i + rot) % N, i0 = Math.floor(j), t = j - i0;
      const p = ol[i0], q = ol[(i0 + 1) % N];
      pos.push(lerp(p[0], q[0], t) * r.s, r.y, lerp(p[1], q[1], t) * r.s);
    });
  });
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < N; i++) {
    const a = k * N + i, b = k * N + (i + 1) % N, cc = (k + 1) * N + i, d = (k + 1) * N + (i + 1) % N;
    idx.push(a, b, cc, b, d, cc);
  }
  const top = pos.length / 3; pos.push(0, rings[0].y, 0);
  const cul = pos.length / 3; pos.push(0, -gird / 2 - pav, 0);
  for (let i = 0; i < N; i++) { idx.push(top, (i + 1) % N, i); idx.push(cul, (rings.length - 1) * N + i, (rings.length - 1) * N + (i + 1) % N); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  orientOutward(g);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return { geometry: g, crown, girdle: gird, pavilion: pav, outline: ol, depth: crown + gird + pav, top: gird / 2 + crown, culet: -gird / 2 - pav };
}

/** Polar direction (radians, from +Z towards +X) for prong n of count on a given cut. */
function prongAngles(cut, count) {
  const c = CUTS[cut] || CUTS.round;
  const out = [];
  if (cut === 'trillion') { for (let k = 0; k < 3; k++) out.push((k / 3) * 2 * Math.PI); if (count >= 6) for (let k = 0; k < 3; k++) out.push(((k + 0.5) / 3) * 2 * Math.PI); return out; }
  if (cut === 'pear' || cut === 'heart') {
    out.push(0);                                                // V-prong protecting the tip (+Z)
    const rest = Math.max(2, count - 1), spread = rest === 2 ? 1.9 : 2.6;
    for (let k = 0; k < rest; k++) out.push(Math.PI + (k / (rest - 1) - 0.5) * spread);
    return out;
  }
  if (cut === 'marquise') {
    out.push(0, Math.PI);                                       // both tips
    const sides = Math.max(0, Math.floor((count - 2) / 2));
    for (let j = 0; j < sides; j++) { const a = Math.PI / 2 + ((j + 0.5) / sides - 0.5) * 1.3; out.push(a, -a); }
    return out;
  }
  const off = c.corners ? Math.PI / 4 : (count === 4 ? Math.PI / 4 : count === 6 ? 0 : Math.PI / count);
  for (let k = 0; k < count; k++) out.push(off + (k / count) * 2 * Math.PI);
  return out;
}
/** Outline point in direction ang (polar, from centre). */
function rimPoint(ol, ang) {
  let best = ol[0], bd = 9;
  for (const p of ol) {
    const a = Math.atan2(p[0], p[1]);
    let d = Math.abs(a - ang) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Setting head. Returns { parts:[{name,layer,kind,geometry}], meta }.
 * baseY: y (below girdle) where the head meets the shank / pendant surface.
 */
export function buildHead(o) {
  const {
    cut = 'round', L, W, headType = 'prong', prongCount = 4, prongStyle = 'round', prongDia = 0,
    baseY = -4, rails = 1, haloStone = 1.3, haloGap = 0.15, seatOverlap = 0.18, bezelWall = 0.7,
    gem = 'diamond', basketTaper = 0.62, metalOnly = false,
  } = o;
  const st = stoneGeometry(cut, L, W);
  const minD = Math.min(L, W);
  const pd = prongDia > 0 ? prongDia : Math.max(RULES.prongDiaForStone(minD), 0.6) + (prongCount <= 4 && minD > 7 ? 0.1 : 0);
  const pr = pd / 2;
  const parts = [];
  const meta = { stoneL: L, stoneW: W, stoneDepth: st.depth, prongDia: pd, prongCount: 0, seatOverlap, headType, cut, bezelWall, culetY: st.culet, topY: st.top };
  if (!metalOnly) parts.push({ name: 'Center stone', layer: 'Stones::Center', kind: 'stone', gem, pieces: [st.geometry] });

  const girdleOutline = st.outline;
  const grow = (p, d) => { const r = Math.hypot(p[0], p[1]) || 1; return [p[0] * (r + d) / r, p[1] * (r + d) / r]; };

  if (headType === 'prong' || headType === 'halo') {
    const angs = prongAngles(cut, prongCount);
    meta.prongCount = angs.length;
    const prongGeos = [], tipGeos = [];
    const topY = st.top * (prongStyle === 'claw' ? 0.75 : 0.62);
    for (const ang of angs) {
      const rp = rimPoint(girdleOutline, ang);
      const atRim = grow(rp, pr - seatOverlap);                     // prong centre so it overlaps the girdle by seatOverlap
      const base = [atRim[0] * basketTaper, atRim[1] * basketTaper];
      const pts = [
        V(base[0], baseY - 0.4, base[1]),
        V(lerp(base[0], atRim[0], 0.55), lerp(baseY, 0, 0.55), lerp(base[1], atRim[1], 0.55)),
        V(atRim[0], 0, atRim[1]),
        V(atRim[0] * 0.995, topY, atRim[1] * 0.995),
      ];
      prongGeos.push(tube(pts, (u) => pr * (0.82 + 0.18 * u), { segments: 24, radial: 12 }));
      const tipC = V(atRim[0] * 0.97, topY, atRim[1] * 0.97);
      if (prongStyle === 'pointed') {
        const dir = V(-atRim[0], 0, -atRim[1]).normalize().multiplyScalar(0.55).add(V(0, 1, 0)).normalize();
        tipGeos.push(spike(tipC.clone().addScaledVector(dir, -pr * 0.3), dir, pd * 1.5, pr * 1.02));
      } else if (prongStyle === 'claw') {
        const inward = V(-atRim[0], 0, -atRim[1]).normalize();
        tipGeos.push(tube([tipC.clone().addScaledVector(inward, -pr * 0.2), tipC.clone().addScaledVector(inward, pr * 0.9).add(V(0, -pr * 0.15, 0))], (u) => pr * (1 - 0.35 * u), { segments: 8, radial: 12 }));
      } else {
        tipGeos.push(sphere(tipC.clone().add(V(0, pr * 0.15, 0)), pr * 1.08));
      }
    }
    parts.push({ name: 'Prongs', layer: 'Head::Prongs', kind: 'metal', pieces: [...prongGeos, ...tipGeos], seatCut: true });

    // gallery rails (basket wires) — closed loops through the prongs
    const railGeos = [];
    for (let r = 0; r < rails; r++) {
      const f = rails === 1 ? 0.5 : 0.35 + 0.4 * r;             // fraction from base (0) to girdle (1)
      const y = lerp(baseY, 0, f) - (r === rails - 1 ? 0.35 : 0);
      const s = lerp(basketTaper, 1, f);
      const loop = girdleOutline.filter((_, i) => i % 2 === 0).map((p) => { const q = grow(p, pr - seatOverlap); return V(q[0] * s, y, q[1] * s); });
      // keep the rail clear of the pavilion
      const pavR = 1 - (Math.abs(y) - st.girdle / 2) / st.pavilion;
      if (y < 0 && pavR > s - 0.02) continue;
      railGeos.push(tube(loop, pr * 0.72, { closed: true, segments: 72, radial: 10 }));
    }
    if (railGeos.length) parts.push({ name: 'Gallery rails', layer: 'Head::Gallery', kind: 'metal', pieces: railGeos, seatCut: true });
    meta.rails = railGeos.length;
  }

  if (headType === 'bezel') {
    // bezel wall: outer = girdle + wall, inner = girdle - lip; from below the girdle to just above the crown edge
    const ol = resampleObj(girdleOutline, 64);
    const lip = Math.min(0.35, minD * 0.06);
    const y0 = Math.max(baseY, -st.pavilion * 0.85), y1 = st.girdle / 2 + st.crown * 0.35;
    const prof = [[-lip, y0], [bezelWall, y0], [bezelWall, y1 - 0.05], [bezelWall - 0.15, y1], [-lip, y1]];
    const frame = polylineFrame(ol.map(([x, z]) => V(x, 0, z)), true);
    const g = sweep({ frame: (u) => { const f = frame(u); return { p: f.p, n: f.n, b: V(0, 1, 0) }; }, profile: () => prof, stations: 128, closed: true });
    parts.push({ name: 'Bezel', layer: 'Head::Bezel', kind: 'metal', pieces: [g], seatCut: true });
    if (baseY < y0 - 0.2) {
      const ped = ol.map(([x, z]) => { const r = Math.hypot(x, z) || 1, s = (r + bezelWall * 0.5) / r * 0.7; return V(x * s, 0, z * s); });
      const fr = polylineFrame(ped, true);
      parts.push({ name: 'Bezel pedestal', layer: 'Head::Bezel', kind: 'metal', seatCut: true, pieces: [sweep({ frame: (u) => { const f = fr(u); return { p: f.p, n: f.n, b: V(0, 1, 0) }; }, profile: () => [[-0.5, baseY - 0.3], [0.5, baseY - 0.3], [0.5, y0 + 0.2], [-0.5, y0 + 0.2]], stations: 96 })] });
    }
    meta.bezelLip = lip; meta.prongCount = 0;
  }

  if (headType === 'halo') {
    const off = haloStone / 2 + haloGap + 0.25 + (pr - seatOverlap) * 0.5;
    const ring = offsetPoly(girdleOutline.map(([x, z]) => [x, z]), off);
    const per = ring.reduce((s, p, i) => s + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0);
    const count = Math.max(8, Math.floor(per / (haloStone + haloGap)));
    const pts = resampleObj(ring, count);
    const hs = stoneGeometry('round', haloStone, haloStone, { N: 16 });
    const hy = -st.girdle / 2 - 0.15;
    const stones = [], beads = [];
    const beadR = Math.max(0.28, haloStone * 0.24);
    pts.forEach(([x, z], i) => {
      const g = hs.geometry.clone(); g.translate(x, hy, z); stones.push(g);
      const [x2, z2] = pts[(i + 1) % pts.length];
      const mx = (x + x2) / 2, mz = (z + z2) / 2;
      beads.push(sphere(V(mx, hy + hs.top * 0.75, mz), beadR, 10));
    });
    if (!metalOnly) parts.push({ name: `Halo stones (${count})`, layer: 'Stones::Halo', kind: 'stone', gem: 'diamond', pieces: stones });
    // halo frame: band under the halo stones
    const frameR = offsetPoly(girdleOutline, off);
    const fr = polylineFrame(resampleObj(frameR, 96).map(([x, z]) => V(x, 0, z)), true);
    const w = haloStone / 2 + 0.3;
    const frameGeo = sweep({ frame: (u) => { const f = fr(u); return { p: f.p, n: f.n, b: V(0, 1, 0) }; }, profile: () => [[-w, hy - hs.depth * 0.9], [w, hy - hs.depth * 0.9], [w, hy - 0.05], [-w, hy - 0.05]], stations: 128 });
    parts.push({ name: 'Halo frame', layer: 'Head::Halo', kind: 'metal', pieces: [frameGeo], seatCut: true, haloSeat: true });
    parts.push({ name: 'Halo beads', layer: 'Head::Halo', kind: 'metal', pieces: beads });
    meta.haloCutters = stones.map((g) => g);
    meta.haloCount = count; meta.haloGap = haloGap; meta.haloStone = haloStone; meta.beadDia = beadR * 2;
    meta.haloOuter = off + w;
  }
  meta.headRadius = Math.max(L, W) / 2 + (headType === 'halo' ? meta.haloOuter : pd);
  return { parts, meta, stone: st, cutter: stoneCutter(st, cut, L, W) };
}

function resampleObj(poly, n) { return resample(poly, n); }

/** Slightly oversized stone used to cut seats (bearing) into prongs / bezels. */
export function stoneCutter(st, cut, L, W) {
  const g = stoneGeometry(cut, L + 0.06, W + 0.06).geometry;
  // extend upwards so the cutter clears the crown and opens the seat from above
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.01) pos.setY(i, pos.getY(i) + st.crown * 0.05);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export { prongAngles, rimPoint };
