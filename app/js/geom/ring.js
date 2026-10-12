// Parametric ring: shank sweep + style features + setting head.
// Frame: finger axis = Z, ring in XY plane, head at +Y.
import * as THREE from 'three';
import { usToDiameter, stoneDimsFromCarat } from '../data.js';
import { V, sweep, ellipseFrame, superProfile, PROFILES, worley, vnoise, smooth, lerp, clamp, DEG, tube, spike, sphere, merge } from './util.js';
import { buildHead, SETTING_DEFAULTS, headOptions } from './stone.js';
import { signetFace } from './relief.js';
import { monogram, engravingCutter } from './text.js';

export const RING_DEFAULTS = {
  ringSize: 6.5, profile: 'comfort', shankStyle: 'classic',
  widthTop: 2.4, widthBottom: 2.0, thickTop: 1.9, thickBottom: 1.6,
  texture: 'none', textureDepth: 0.12, textureScale: 1.0,
  headType: 'prong', cut: 'round', gem: 'diamond', sizeMode: 'carat', carat: 1.0, stoneL: 6.4, stoneW: 6.4,
  prongCount: 4, prongStyle: 'round', prongDia: 0, galleryLift: 1.2, rails: 1, cathedral: false,
  haloStone: 1.3, haloGap: 0.15, accentCount: 0, accentSize: 1.3, milgrain: false,
  spikes: 0, spikeLen: 1.8, spikeBase: 1.1, spikeRows: 1,
  openwork: 'none', openCount: 10, openSize: 0.55,
  backHollow: false, hollowDepth: 0.5, hollowRail: 0.8, hollowSpan: 200,
  coils: 0, seatCut: true, splitGap: 1.6, twist: 2.5,
  accentMode: 'shoulders', sideStones: 'none', sideCut: 'round', sideRatio: 0.6, sideHead: 'prong',
  signetShape: 'oval', signetW: 12, signetL: 10, signetT: 1.6, signetFace: 'plain', signetText: 'AR', signetFont: 'cinzel', faceDepth: 0.5,
  engraveText: '', engraveFont: 'gentilis', engraveSize: 1.6, engraveDepth: 0.15, headMetal: 'same',
  ...SETTING_DEFAULTS,
};

export function buildRing(P) {
  const p = { ...RING_DEFAULTS, ...P };
  const Rin = usToDiameter(p.ringSize) / 2;
  const parts = [], cutters = [], meta = { type: 'ring', innerDiameter: Rin * 2, ringSize: p.ringSize };
  const prof = PROFILES[p.profile] || PROFILES.comfort;
  const topW = (th) => (1 + Math.cos(th)) / 2;                    // 1 at top, 0 at bottom
  const W = (th) => lerp(p.widthBottom, p.widthTop, Math.pow(topW(th), 1.6));
  const T = (th) => lerp(p.thickBottom, p.thickTop, Math.pow(topW(th), 1.6));
  const signet = p.shankStyle === 'signet';
  const hasHead = p.headType !== 'none' && !signet;

  // ---------- textures ----------
  const circ = 2 * Math.PI * Rin;
  const displace = p.texture === 'none' ? null : (u, a, b, j) => {
    const th = u * 2 * Math.PI;
    const t = T(th);
    const outer = smooth(t * 0.35, t * 0.9, a);                     // only the outer skin moves
    if (outer <= 0) return 0;
    const s = u * circ / p.textureScale, z = b / p.textureScale;
    let d = 0;
    if (p.texture === 'hammered') { const w = worley(s * 0.9, z * 0.9 + 7.1); d = -p.textureDepth * Math.max(0, 1 - (w * 1.45) ** 2); }
    else if (p.texture === 'organic') d = p.textureDepth * (Math.sin(s * 0.9 + Math.sin(z * 1.3) * 1.6) * 0.6 + (vnoise(s * 0.5, z * 0.6) - 0.5) * 0.8);
    else if (p.texture === 'ridged') d = -p.textureDepth * Math.pow(Math.abs(Math.sin(s * 1.8)), 6);
    else if (p.texture === 'bark') d = -p.textureDepth * (vnoise(s * 0.35, z * 3.2) * 0.8 + vnoise(s * 1.4, z * 6) * 0.4);
    else if (p.texture === 'florentine') d = -p.textureDepth * 0.6 * (Math.abs(Math.sin((s + z) * 4)) > 0.85 ? 1 : 0);
    // keep the head seat zone clean
    const headClear = hasHead ? smooth(0.06, 0.16, Math.min(u, 1 - u)) : 1;
    return d * outer * headClear;
  };

  // ---------- shank ----------
  const frame = ellipseFrame(Rin, Rin);
  const shankGeos = [];
  if (p.shankStyle === 'split' || p.shankStyle === 'bypass') {
    for (const side of [-1, 1]) {
      shankGeos.push(sweep({
        stations: 220, frame: (u) => {
          const f = frame(u), th = u * 2 * Math.PI;
          const open = smooth(0.55, 1.0, topW(th));
          const bypass = p.shankStyle === 'bypass' ? Math.sin(th) * 0.5 * W(th) : 0;
          const off = side * (W(th) / 4 + open * p.splitGap / 2) + side * bypass * open;
          return { p: f.p.clone().addScaledVector(f.b, off), n: f.n, b: f.b };
        },
        profile: (u) => { const th = u * 2 * Math.PI; return superProfile(W(th) / 2, T(th), prof.nOut, prof.nIn, 28); },
        displace,
      }));
    }
    meta.minWidth = Math.min(p.widthTop, p.widthBottom) / 2;
  } else if (p.shankStyle === 'twisted') {
    const strands = 2;
    for (let k = 0; k < strands; k++) {
      shankGeos.push(sweep({
        stations: 320, frame: (u) => {
          const f = frame(u), th = u * 2 * Math.PI;
          const ph = th * p.twist * 2 + (k / strands) * 2 * Math.PI;
          const rr = W(th) * 0.24;
          const d = W(th) * 0.55;
          return { p: f.p.clone().addScaledVector(f.n, d / 2 + rr * 0.5 * (1 + Math.cos(ph))).addScaledVector(f.b, Math.sin(ph) * rr), n: f.n, b: f.b };
        },
        profile: (u) => { const th = u * 2 * Math.PI; const d = W(th) * 0.55; return superProfile(d, d, 2, 2, 20).map(([a, b]) => [a - d / 2, b]); },
      }));
    }
    meta.minWidth = Math.min(p.widthTop, p.widthBottom) * 0.55;
    meta.twistWire = meta.minWidth;
  } else {
    shankGeos.push(sweep({
      stations: p.texture === 'none' ? 200 : 360,
      frame, profile: (u) => { const th = u * 2 * Math.PI; return superProfile(W(th), T(th), prof.nOut, prof.nIn, p.texture === 'none' ? 36 : 56); },
      displace,
    }));
    meta.minWidth = Math.min(p.widthTop, p.widthBottom);
  }
  shankGeos.forEach((g, i) => parts.push({ name: shankGeos.length > 1 ? `Shank ${i + 1}` : 'Shank', layer: 'Shank::Band', kind: 'metal', pieces: [g], csgTarget: 'shank' }));
  meta.minThickness = p.shankStyle === 'twisted' ? meta.twistWire : Math.min(p.thickTop, p.thickBottom) - (p.texture === 'hammered' || p.texture === 'ridged' || p.texture === 'bark' ? p.textureDepth : 0);
  meta.widthTop = p.widthTop; meta.widthBottom = p.widthBottom; meta.thickBottom = p.thickBottom; meta.thickTop = p.thickTop;
  const outerTop = Rin + p.thickTop;

  // ---------- head ----------
  let head = null;
  if (hasHead) {
    const d = p.sizeMode === 'mm' ? { L: p.stoneL, W: p.stoneW } : stoneDimsFromCarat(p.cut, p.carat, p.gem);
    const st0 = { L: d.L, W: d.W };
    meta.stone = { cut: p.cut, L: st0.L, W: st0.W, carat: p.carat, gem: p.gem };
    // girdle height so the culet floats galleryLift above the shank top
    const probe = buildHead({ cut: p.cut, L: st0.L, W: st0.W, headType: 'bezel', metalOnly: true });
    const culetDepth = -probe.stone.culet;
    const girdleY = outerTop + p.galleryLift + culetDepth;
    head = buildHead({
      ...headOptions(p),
      cut: p.cut, L: st0.L, W: st0.W, headType: p.headType, prongCount: p.prongCount, prongStyle: p.prongStyle,
      prongDia: p.prongDia, baseY: -(girdleY - outerTop) - 0.05, rails: p.rails, haloStone: p.haloStone, haloGap: p.haloGap, gem: p.gem,
    });
    for (const part of head.parts) { part.pieces.forEach((g) => g.translate(0, girdleY, 0)); parts.push(part); }
    head.cutter.translate(0, girdleY, 0);
    cutters.push({ type: 'seat', geometry: head.cutter });
    Object.assign(meta, head.meta);
    meta.girdleY = girdleY; meta.headHeight = girdleY + head.stone.top - Rin; // finger surface to table
    meta.culetClear = girdleY + head.stone.culet - Rin;                        // finger surface to culet
    meta.culetToShank = girdleY + head.stone.culet - outerTop;

    // cathedral arches from the shoulders up to the basket
    if (p.cathedral && p.headType !== 'bezel') {
      const arcs = [];
      const hw = Math.max(st0.W, st0.L) / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const th = sx * 38 * DEG;
        const sh = V(Math.sin(th) * (Rin + T(th) * 0.6), Math.cos(th) * (Rin + T(th) * 0.6), sz * W(th) * 0.18);
        const mid = V(sx * hw * 0.95, girdleY - head.stone.depth * 0.45 - 0.6, sz * W(0) * 0.32);
        const top = V(sx * hw * 0.55, girdleY - head.stone.depth * 0.38, sz * st0.L * 0.22);
        arcs.push(tube([sh, mid, top], (u) => lerp(Math.min(W(th), T(th)) * 0.32, 0.45, u), { segments: 28, radial: 12 }));
      }
      parts.push({ name: 'Cathedral arches', layer: 'Shank::Cathedral', kind: 'metal', pieces: arcs });
      meta.cathedral = true;
    }
  } else {
    meta.headHeight = p.thickTop;
  }

  // ---------- side stones (three-stone / trilogy) ----------
  if (hasHead && p.sideStones === 'three-stone') {
    const c = meta.stone;
    const sd = stoneDimsFromCarat(p.sideCut, 1, p.gem);
    const sW = c.W * p.sideRatio, sL = sW * (sd.L / sd.W);
    const rotated = ['pear', 'heart', 'marquise', 'trillion'].includes(p.sideCut);      // tips point towards the centre stone
    const xExt = (rotated ? sL : sW) / 2;
    const probeS = buildHead({ cut: p.sideCut, L: sL, W: sW, headType: 'bezel', metalOnly: true });
    const sLift = Math.max(0.3, p.galleryLift * 0.6);
    const rS = outerTop + sLift - probeS.stone.culet;
    const centreHalf = c.W / 2 + (meta.prongDia || 0.8) + (p.headType === 'halo' ? meta.haloOuter || 0 : 0);
    const sidePd = Math.max(0.6, (meta.prongDia || 0.8) * 0.85);
    const gap = 0.3;
    const theta = (centreHalf + gap + xExt + sidePd) / ((meta.girdleY + rS) / 2);
    const sideMetal = [], sideGems = [];
    for (const side of [-1, 1]) {
      const h = buildHead({ cut: p.sideCut, L: sL, W: sW, headType: p.sideHead, prongCount: ['pear', 'heart', 'trillion'].includes(p.sideCut) ? 3 : 4, prongStyle: p.prongStyle, baseY: -(rS - outerTop) - 0.05, rails: 1, gem: p.gem });
      const place = (g) => { if (rotated) g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2); g.translate(0, rS, 0); g.rotateZ(-side * theta); };
      for (const part of h.parts) { part.pieces.forEach(place); (part.kind === 'stone' ? sideGems : sideMetal).push(...part.pieces); }
      place(h.cutter); cutters.push({ type: 'seat', geometry: h.cutter });
    }
    parts.push({ name: 'Side stones (2)', layer: 'Stones::Side', kind: 'stone', gem: p.gem, pieces: sideGems });
    parts.push({ name: 'Side heads', layer: 'Head::Side', kind: 'metal', pieces: sideMetal, seatCut: true });
    meta.side = { cut: p.sideCut, L: sL, W: sW, angleDeg: (theta * 180) / Math.PI, gap };
    meta.sideGap = gap;
  }

  // ---------- signet plate + face ----------
  if (signet) {
    const W2 = p.signetW, L2 = p.signetL;
    const ol = signetOutline(p.signetShape, W2, L2);
    const shape = new THREE.Shape(ol.map(([x, z]) => new THREE.Vector2(x, z)));
    const y0 = outerTop - 1.2, y1 = outerTop + p.signetT;
    const bev = Math.min(0.4, p.signetT * 0.3);
    const plate = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 3, curveSegments: 4 });
    plate.translate(0, 0, y0 + bev);
    plate.rotateX(-Math.PI / 2);                                   // extrusion +Z → +Y; outline (x, z) → (x, −z), symmetric
    parts.push({ name: 'Signet plate', layer: 'Shank::Signet', kind: 'metal', pieces: [plate], csgTarget: 'signet' });
    meta.signet = { shape: p.signetShape, W: W2, L: L2, T: p.signetT, face: p.signetFace };
    meta.headHeight = p.thickTop + p.signetT;
    const faceW = W2 - 2 * bev - 0.6, faceL = L2 - 2 * bev - 0.6;
    const reliefShape = { oval: 'circle', round: 'circle', cushion: 'cushion', octagon: 'octagon', square: 'square', shield: 'shield' }[p.signetShape] || 'circle';
    const mode = p.signetFace.endsWith('engrave') ? 'engrave' : 'emboss';
    if (p.signetFace.startsWith('image')) {
      const g = signetFace({ shape: reliefShape, w: faceW, l: faceL, topY: y1, depth: p.faceDepth, mode, res: 120 });
      if (mode === 'engrave') cutters.push({ type: 'engrave', target: 'signet', geometry: g });
      else parts.push({ name: 'Signet relief', layer: 'Shank::Signet', kind: 'metal', pieces: [g] });
    } else if (p.signetFace.startsWith('initials')) {
      const m = monogram({ text: p.signetText, fontKey: p.signetFont, maxW: faceW, maxL: faceL, topY: y1, depth: p.faceDepth, mode });
      if (m) {
        if (mode === 'engrave') cutters.push({ type: 'engrave', target: 'signet', geometry: m.pieces });
        else parts.push({ name: `Monogram "${p.signetText}"`, layer: 'Shank::Signet', kind: 'metal', pieces: m.pieces });
        meta.faceStroke = m.minStroke;
      } else meta.pendingFont = p.signetFont;
    }
    meta.faceDepth = p.faceDepth;
  }

  // ---------- accent stones: shoulders, half or full eternity ----------
  if (p.accentCount > 0 || p.accentMode !== 'shoulders') {
    const stones = [], beads = [];
    const sz = p.accentSize, pitch = sz + 0.25;
    const sg = buildHead({ cut: 'round', L: sz, W: sz, headType: 'bezel', metalOnly: true }).stone;
    const Rt = Rin + p.thickTop;
    let centreDeg = 0;
    if (hasHead) centreDeg = 14 + ((Math.max(meta.stone.W, meta.stone.L) / 2) / Rin / DEG) * 0.6 + (meta.side ? meta.side.angleDeg + ((meta.side.W / 2 + 1) / Rin) / DEG : 0);
    else if (signet) centreDeg = ((p.signetW / 2 + 0.8) / Rin) / DEG;
    const angles = [];
    if (p.accentMode === 'shoulders') {
      for (const side of [-1, 1]) for (let i = 0; i < p.accentCount; i++) angles.push(side * (Math.max(centreDeg, 8) + (i * pitch) / Rt / DEG));
    } else {
      const span = p.accentMode === 'full-eternity' ? 360 : 180;
      const n = Math.floor((span * DEG * Rt) / pitch);
      for (let i = 0; i < n; i++) {
        const a = p.accentMode === 'full-eternity' ? (i / n) * 360 : -span / 2 + ((i + 0.5) / n) * span;
        const wrapped = ((a + 540) % 360) - 180;
        if (Math.abs(wrapped) < centreDeg) continue;
        angles.push(wrapped);
      }
    }
    for (const deg of angles) {
      const th = deg * DEG;
      const r = Rin + T(th) - sg.top * 0.35;
      const g = sg.geometry.clone();
      g.rotateZ(-th);
      g.translate(Math.sin(th) * r, Math.cos(th) * r, 0);
      stones.push(g);
      const bth = th + (pitch / 2) / Rt;
      const br = Rin + T(bth) + 0.05;
      for (const bz of [-1, 1]) beads.push(sphere(V(Math.sin(bth) * br, Math.cos(bth) * br, bz * (sz / 2 + 0.05)), 0.3, 8));
    }
    if (stones.length) {
      parts.push({ name: `Accent stones (${stones.length})`, layer: 'Stones::Accents', kind: 'stone', gem: 'diamond', pieces: stones });
      parts.push({ name: 'Pavé beads', layer: 'Shank::Pave', kind: 'metal', pieces: beads });
      meta.accentSize = sz; meta.accentCount = stones.length; meta.accentMode = p.accentMode;
      meta.accentFit = Math.min(...angles.map((d) => W(d * DEG))) - sz;
      if (p.accentMode === 'full-eternity') meta.notResizable = true;
    }
  }

  // ---------- inside engraving ----------
  if (p.engraveText && p.engraveText.trim() && p.shankStyle !== 'twisted') {
    const e = engravingCutter({ text: p.engraveText, fontKey: p.engraveFont, size: p.engraveSize, depth: p.engraveDepth, Rin });
    if (e && e.geometry) {
      cutters.push({ type: 'engrave', target: 'shank', geometry: e.geometry });
      meta.engrave = { arcDeg: e.arcDeg, size: p.engraveSize, depth: p.engraveDepth, minStroke: e.minStroke, text: p.engraveText };
    } else if (e && e.tooLong) meta.engrave = { tooLong: true, text: p.engraveText };
    else meta.pendingFont = p.engraveFont;
  }

  // ---------- milgrain edges ----------
  if (p.milgrain) {
    const beads = [];
    const n = Math.floor(circ / 0.55);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * 2 * Math.PI;
      if (hasHead && Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < 12 * DEG) continue;
      const r = Rin + T(th) * 0.55;
      for (const s of [-1, 1]) beads.push(sphere(V(Math.sin(th) * r, Math.cos(th) * r, s * W(th) / 2), 0.2, 6));
    }
    parts.push({ name: 'Milgrain', layer: 'Shank::Milgrain', kind: 'metal', pieces: beads });
  }

  // ---------- gothic spikes ----------
  if (p.spikes > 0) {
    const sp = [];
    for (let row = 0; row < p.spikeRows; row++) for (let i = 0; i < p.spikes; i++) {
      const th = ((i + 0.5 + row * 0.5) / p.spikes) * 2 * Math.PI;
      if (hasHead && Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < 22 * DEG) continue;
      const z = p.spikeRows === 1 ? 0 : (row === 0 ? -1 : 1) * W(th) * 0.22;
      const r = Rin + T(th) - 0.25;
      const n = V(Math.sin(th), Math.cos(th), 0);
      const dir = n.clone().add(V(0, 0, z * 0.12)).normalize();
      sp.push(spike(V(n.x * r, n.y * r, z), dir, p.spikeLen + 0.25, p.spikeBase / 2, 0.06, 14));
    }
    parts.push({ name: `Spikes (${sp.length})`, layer: 'Ornament::Spikes', kind: 'metal', pieces: sp });
    meta.spikeBase = p.spikeBase; meta.spikeLen = p.spikeLen; meta.spikeCount = sp.length;
  }

  // ---------- organic coils ----------
  if (p.coils > 0) {
    const cg = [];
    for (let i = 0; i < p.coils; i++) {
      const th0 = ((i + 0.5) / p.coils) * 2 * Math.PI;
      if (hasHead && Math.abs(Math.atan2(Math.sin(th0), Math.cos(th0))) < 25 * DEG) continue;
      const pts = [];
      const turns = 1.6, R0 = Math.min(W(th0), 3.2) * 0.42;
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * turns * 2 * Math.PI, rr = R0 * (1 - k / 48);
        const th = th0 + (Math.cos(a) * rr) / Rin;
        const r = Rin + T(th) + 0.1;
        pts.push(V(Math.sin(th) * r, Math.cos(th) * r, Math.sin(a) * rr));
      }
      cg.push(tube(pts, (u) => lerp(0.42, 0.28, u), { segments: 80, radial: 10 }));
    }
    if (cg.length) parts.push({ name: 'Coils', layer: 'Ornament::Coils', kind: 'metal', pieces: cg });
    meta.coilWire = 0.56;
  }

  // ---------- openwork windows (cut radially through the band) ----------
  if (p.openwork !== 'none' && p.shankStyle !== 'twisted') {
    const wins = [];
    const n = p.openCount;
    let minBridge = Infinity, minHole = Infinity;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * 2 * Math.PI;
      if (hasHead && Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < 28 * DEG) continue;
      const w = W(th) * (p.shankStyle === 'split' ? 0.5 : 1);
      const hz = w * p.openSize;                                    // window height across the band
      const pitch = (2 * Math.PI * (Rin + T(th))) / n;
      const ht = Math.min(pitch * 0.62, hz * (p.openwork === 'arch' ? 0.62 : 1));
      minBridge = Math.min(minBridge, (w - hz) / 2, pitch - ht);
      minHole = Math.min(minHole, ht, hz);
      const g = windowCutter(p.openwork, ht, hz, T(th) + 2);
      g.translate(0, Rin - 1, 0);
      g.rotateZ(-th);
      if (p.shankStyle === 'split') {
        for (const s of [-1, 1]) { const h = g.clone(); h.translate(0, 0, s * (W(th) / 4 + smooth(0.55, 1, topW(th)) * p.splitGap / 2)); wins.push(h); }
      } else wins.push(g);
    }
    if (wins.length) cutters.push({ type: 'openwork', target: 'shank', geometry: merge(wins, 0.1) });
    meta.openBridge = minBridge; meta.openHole = minHole; meta.openwork = p.openwork;
  }

  // ---------- backside hollow (under-shank scoop) ----------
  if (p.backHollow && (p.shankStyle === 'classic' || signet)) {
    const span = clamp(p.hollowSpan, 40, 300) * DEG;
    const a0 = Math.PI - span / 2, a1 = Math.PI + span / 2;
    const fr = ellipseFrame(Rin, Rin, a0, a1);
    const g = sweep({
      stations: 160, closed: false, frame: fr,
      profile: (u) => {
        const th = a0 + (a1 - a0) * u;
        const hw = Math.max(0.2, W(th) / 2 - p.hollowRail);
        const ramp = smooth(0, 0.12, Math.min(u, 1 - u));
        const dep = Math.max(0.01, p.hollowDepth * ramp);
        return [[-0.6, -hw], [dep, -hw * 0.92], [dep, hw * 0.92], [-0.6, hw]];
      },
    });
    cutters.push({ type: 'hollow', target: 'shank', geometry: g });
    meta.hollowWall = Math.min(p.thickBottom, T(a0)) - p.hollowDepth - (p.texture === 'hammered' ? p.textureDepth : 0);
    meta.hollowRail = p.hollowRail; meta.hollowDepth = p.hollowDepth;
  }

  meta.style = p.style;
  return { parts, cutters, meta };
}

/** Radial window cutter: 2D shape in the (tangential, axial) plane extruded radially (+Y). */
export function windowCutter(kind, ht, hz, depth) {
  const pts = [];
  const N = 40;
  if (kind === 'arch') {
    // gothic lancet: rectangle + two arcs (radius = span) meeting in a point
    const R = ht, rise = 0.866 * ht;
    const archH = Math.min(rise, hz * 0.62), k = archH / rise;
    const zs = hz / 2 - archH;
    pts.push(new THREE.Vector2(-ht / 2, -hz / 2), new THREE.Vector2(ht / 2, -hz / 2));
    for (let i = 0; i <= 16; i++) { const x = ht / 2 - (i / 16) * ht / 2; const z = Math.sqrt(R * R - (x - (ht / 2 - R)) ** 2); pts.push(new THREE.Vector2(x, zs + z * k)); }
    for (let i = 1; i <= 16; i++) { const x = -(i / 16) * ht / 2; const z = Math.sqrt(R * R - (x + (ht / 2 - R)) ** 2); pts.push(new THREE.Vector2(x, zs + z * k)); }
  } else {
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
      let x, z;
      if (kind === 'diamond') { x = Math.sign(c) * c * c * ht / 2; z = Math.sign(s) * s * s * hz / 2; }
      else if (kind === 'quatrefoil') { const r = 0.72 + 0.28 * Math.abs(Math.cos(2 * t)); x = c * r * ht / 2; z = s * r * hz / 2; }
      else { x = c * ht / 2; z = s * hz / 2; }
      pts.push(new THREE.Vector2(x, z));
    }
  }
  const shape = new THREE.Shape(pts);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);   // extrude along +Y (radial); shape lies in the tangential/axial plane
  return g;
}

/** Signet plate outline in the (x, z) plane. */
export function signetOutline(shape, W, L, N = 96) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    let x, z;
    if (shape === 'cushion') { x = (W / 2) * Math.sign(c) * Math.abs(c) ** 0.5; z = (L / 2) * Math.sign(s) * Math.abs(s) ** 0.5; }
    else if (shape === 'square') { x = (W / 2) * Math.sign(c) * Math.abs(c) ** 0.2; z = (L / 2) * Math.sign(s) * Math.abs(s) ** 0.2; }
    else if (shape === 'octagon') { const k = 1 / Math.max(Math.abs(c), Math.abs(s), (Math.abs(c) + Math.abs(s)) / 1.44); x = (W / 2) * c * k; z = (L / 2) * s * k; }
    else if (shape === 'shield') { x = (W / 2) * c; z = (L / 2) * (s > 0 ? s : s * (1 - 0.35 * c * c)); }
    else { x = (W / 2) * c; z = (L / 2) * s; }
    pts.push([x, z]);
  }
  return pts;
}
