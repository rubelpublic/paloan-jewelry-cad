// Earrings, bangles / cuffs, chains.
import * as THREE from 'three';
import { stoneDimsFromCarat } from '../data.js';
import { V, sweep, ellipseFrame, superProfile, PROFILES, worley, vnoise, smooth, lerp, DEG, tube, sphere, spike, torus } from './util.js';
import { buildHead, SETTING_DEFAULTS, headOptions } from './stone.js';
import { buildPendant } from './pendant.js';

/* ======================= EARRINGS ======================= */
export const EARRING_DEFAULTS = {
  earType: 'stud', pair: true,
  headType: 'prong', cut: 'round', gem: 'diamond', sizeMode: 'carat', carat: 0.5, stoneL: 5.1, stoneW: 5.1, prongCount: 4, prongStyle: 'round', haloStone: 1.1, haloGap: 0.12,
  postDia: 0.8, postLen: 10,
  hoopDia: 18, hoopWidth: 2.5, hoopThick: 1.6, profile: 'dome', texture: 'none', textureDepth: 0.1, hingeClearance: 0.1,
  dropShape: 'teardrop', dropHeight: 14, dropWidth: 9, dropThick: 1.3, spikes: 0, spikeLen: 1.6, spikeBase: 1.0,
  ...SETTING_DEFAULTS, petalLength: 4.5, petalWidth: 2.4,
};

export function buildEarring(P) {
  const p = { ...EARRING_DEFAULTS, ...P };
  const parts = [], cutters = [], meta = { type: 'earring', earType: p.earType, pair: p.pair, postDia: p.postDia, postLen: p.postLen };

  if (p.earType === 'stud') {
    const d = p.sizeMode === 'mm' ? { L: p.stoneL, W: p.stoneW } : stoneDimsFromCarat(p.cut, p.carat, p.gem);
    meta.stone = { cut: p.cut, L: d.L, W: d.W, carat: p.carat, gem: p.gem };
    const probe = buildHead({ cut: p.cut, L: d.L, W: d.W, headType: 'bezel', metalOnly: true });
    const baseY = probe.stone.culet - 1.0;
    const head = buildHead({ ...headOptions(p), cut: p.cut, L: d.L, W: d.W, headType: p.headType, prongCount: p.prongCount, prongStyle: p.prongStyle, baseY, rails: 2, haloStone: p.haloStone, haloGap: p.haloGap, gem: p.gem });
    const place = (g) => g.rotateX(Math.PI / 2);                      // table faces +Z (viewer)
    head.parts.forEach((part) => { part.pieces.forEach(place); parts.push(part); });
    place(head.cutter); cutters.push({ type: 'seat', geometry: head.cutter });
    // base plate the prongs land on + post
    const plateR = Math.min(d.L, d.W) * 0.38;
    const plate = new THREE.CylinderGeometry(plateR, plateR, 0.8, 32); plate.rotateX(Math.PI / 2); plate.translate(0, 0, baseY - 0.2);
    const post = new THREE.CylinderGeometry(p.postDia / 2, p.postDia / 2, p.postLen, 20); post.rotateX(Math.PI / 2); post.translate(0, 0, baseY - 0.4 - p.postLen / 2 + 0.2);
    parts.push({ name: 'Base plate', layer: 'Head::Gallery', kind: 'metal', pieces: [plate] });
    parts.push({ name: 'Post (pin)', layer: 'Findings::Post', kind: 'metal', pieces: [post] });
    Object.assign(meta, head.meta);
    meta.minThickness = 0.8;
  } else if (p.earType === 'hoop') {
    const Rin = p.hoopDia / 2 - p.hoopThick;
    const prof = PROFILES[p.profile] || PROFILES.dome;
    const gap = 6 * DEG;
    const fr = ellipseFrame(Rin, Rin, gap / 2, 2 * Math.PI - gap / 2);
    const circ = 2 * Math.PI * Rin;
    const g = sweep({
      stations: 260, closed: false, frame: fr,
      profile: () => superProfile(p.hoopWidth, p.hoopThick, prof.nOut, prof.nIn, 32),
      displace: p.texture === 'hammered' ? (u, a, b) => {
        const outer = smooth(p.hoopThick * 0.35, p.hoopThick * 0.9, a);
        const w = worley(u * circ * 0.9, b * 0.9 + 3.3);
        return -p.textureDepth * Math.max(0, 1 - (w * 1.45) ** 2) * outer;
      } : null,
    });
    parts.push({ name: 'Hoop', layer: 'Body', kind: 'metal', pieces: [g] });
    // hinged post: wire from one end across the gap
    const a0 = gap / 2, r = Rin + p.hoopThick / 2;
    const pin = tube([V(Math.sin(-a0) * r, Math.cos(-a0) * r, 0), V(0, r + 0.15, 0), V(Math.sin(a0 * 0.6) * r, Math.cos(a0 * 0.6) * r, 0)], p.postDia / 2, { segments: 12, radial: 10 });
    parts.push({ name: 'Hinged post', layer: 'Findings::Post', kind: 'metal', pieces: [pin] });
    meta.hingeClearance = p.hingeClearance; meta.minThickness = p.hoopThick; meta.minWidth = p.hoopWidth; meta.innerDiameter = Rin * 2;
  } else {
    // drop: small pendant + shepherd hook
    const pend = buildPendant({ shape: p.dropShape, height: p.dropHeight, width: p.dropWidth, thickness: p.dropThick, bail: 'loop', bailInner: 1.6, bailWire: 0.7,
      headType: p.headType === 'halo' ? 'bezel' : p.headType, cut: p.cut, gem: p.gem, sizeMode: p.sizeMode, carat: p.carat, stoneL: p.stoneL, stoneW: p.stoneW, prongCount: p.prongCount, spikes: p.spikes, spikeLen: p.spikeLen, spikeBase: p.spikeBase });
    parts.push(...pend.parts); cutters.push(...pend.cutters);
    Object.assign(meta, pend.meta, { type: 'earring', earType: 'drop' });
    const top = p.dropHeight / 2 + 2.2;
    const hook = [V(0, top, 0), V(0, top + 4, 0), V(0, top + 11, -3), V(0, top + 13, -9), V(0, top + 9, -14), V(0, top + 2, -15)];
    parts.push({ name: 'Ear wire', layer: 'Findings::Hook', kind: 'metal', pieces: [tube(hook, p.postDia / 2, { segments: 60, radial: 10 })] });
  }
  return { parts, cutters, meta };
}

/* ======================= BANGLES ======================= */
export const BANGLE_DEFAULTS = {
  innerW: 62, innerH: 54, width: 6, thickness: 2.2, profile: 'comfort', texture: 'none', textureDepth: 0.15, textureScale: 1.4,
  cuffGap: 0, hinge: false, hingeClearance: 0.1, spikes: 0, spikeLen: 2.4, spikeBase: 1.6, backHollow: false, hollowDepth: 1.0, hollowRail: 1.0,
};
export function buildBangle(P) {
  const p = { ...BANGLE_DEFAULTS, ...P };
  const parts = [], cutters = [], meta = { type: 'bangle', innerW: p.innerW, innerH: p.innerH, minThickness: p.thickness, minWidth: p.width, widthTop: p.width, thickBottom: p.thickness };
  const prof = PROFILES[p.profile] || PROFILES.comfort;
  const a = p.innerW / 2, b = p.innerH / 2;
  const gap = p.cuffGap > 0 ? p.cuffGap / a : 0;                     // gap in radians (approx) at the bottom
  const open = gap > 0;
  const fr = open ? ellipseFrame(a, b, Math.PI + gap / 2, 3 * Math.PI - gap / 2) : ellipseFrame(a, b);
  const circ = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const displace = p.texture === 'none' ? null : (u, aa, bb) => {
    const outer = smooth(p.thickness * 0.35, p.thickness * 0.9, aa);
    const s = u * circ / p.textureScale, z = bb / p.textureScale;
    let d = 0;
    if (p.texture === 'hammered') { const w = worley(s * 0.9, z * 0.9 + 1.7); d = -p.textureDepth * Math.max(0, 1 - (w * 1.45) ** 2); }
    else if (p.texture === 'organic') d = p.textureDepth * (Math.sin(s * 0.6 + Math.sin(z * 1.1) * 2) * 0.6 + (vnoise(s * 0.4, z * 0.5) - 0.5));
    else if (p.texture === 'ridged') d = -p.textureDepth * Math.pow(Math.abs(Math.sin(s * 1.4)), 6);
    else if (p.texture === 'bark') d = -p.textureDepth * (vnoise(s * 0.3, z * 3) * 0.8 + vnoise(s * 1.2, z * 5) * 0.4);
    return d * outer;
  };
  const g = sweep({ stations: 480, closed: !open, frame: fr, profile: () => superProfile(p.width, p.thickness, prof.nOut, prof.nIn, 40), displace });
  parts.push({ name: open ? 'Cuff' : 'Bangle', layer: 'Body', kind: 'metal', pieces: [g], csgTarget: 'shank' });
  if (p.hinge && !open) {
    const k = [], kn = 3, len = (p.width - (kn - 1) * p.hingeClearance) / kn, R = p.thickness * 0.55;
    for (let i = 0; i < kn; i++) {
      const c = new THREE.CylinderGeometry(R, R, len, 20); c.rotateX(Math.PI / 2);
      c.translate(a + p.thickness * 0.5, 0, -p.width / 2 + len / 2 + i * (len + p.hingeClearance));
      k.push(c);
    }
    parts.push({ name: 'Hinge knuckles', layer: 'Mechanism::Hinge', kind: 'metal', pieces: k });
    meta.hingeClearance = p.hingeClearance; meta.knuckleLen = len;
  }
  if (p.spikes > 0) {
    const sp = [];
    for (let i = 0; i < p.spikes; i++) {
      const u = (i + 0.5) / p.spikes; const f = fr(u);
      sp.push(spike(f.p.clone().addScaledVector(f.n, p.thickness - 0.3), f.n, p.spikeLen + 0.3, p.spikeBase / 2, 0.08));
    }
    parts.push({ name: `Spikes (${sp.length})`, layer: 'Ornament::Spikes', kind: 'metal', pieces: sp });
    meta.spikeBase = p.spikeBase; meta.spikeLen = p.spikeLen;
  }
  if (p.backHollow) {
    const hf = open ? fr : ellipseFrame(a, b, 0.02, 2 * Math.PI - 0.02);
    cutters.push({ type: 'hollow', target: 'shank', geometry: sweep({ stations: 360, closed: false, frame: hf, profile: (u) => {
      const ramp = smooth(0, 0.03, Math.min(u, 1 - u)), dep = Math.max(0.01, p.hollowDepth * ramp), hw = Math.max(0.2, p.width / 2 - p.hollowRail);
      return [[-0.6, -hw], [dep, -hw * 0.95], [dep, hw * 0.95], [-0.6, hw]]; } }) });
    meta.hollowWall = p.thickness - p.hollowDepth - (p.texture !== 'none' ? p.textureDepth : 0); meta.hollowRail = p.hollowRail; meta.hollowDepth = p.hollowDepth;
  }
  meta.cuffGap = p.cuffGap;
  return { parts, cutters, meta };
}

/* ======================= CHAINS ======================= */
export const CHAIN_DEFAULTS = { linkType: 'cable', wireDia: 0.8, linkInnerL: 3.2, linkInnerW: 2.0, lengthCm: 45, claspWeight: 0.35 };
export function buildChain(P) {
  const p = { ...CHAIN_DEFAULTS, ...P };
  const d = p.wireDia;
  const Li = p.linkType === 'rolo' ? p.linkInnerW : p.linkInnerL, Wi = p.linkInnerW;
  const Lc = Li + d, Wc = Wi + d;                                    // centre-line
  const perim = 2 * (Lc - Wc) + Math.PI * Wc;
  const linkVol = Math.PI * (d / 2) ** 2 * perim;
  const pitch = Li;                                                  // interlocked links advance by the inner length
  const total = p.lengthCm * 10;
  let count = Math.ceil(total / pitch);
  let vol = count * linkVol;
  if (p.linkType === 'figaro') { const longV = Math.PI * (d / 2) ** 2 * (2 * (Lc * 2.2 - Wc) + Math.PI * Wc); const groups = Math.ceil(total / (pitch * 3 + Li * 2.2)); count = groups * 4; vol = groups * (3 * linkVol + longV); }
  if (p.linkType === 'curb') vol *= 0.97;                            // diamond-cut flats
  // display: lay links along a U-shaped drape (first ~260 links)
  const show = Math.min(count, 260), geos = [];
  const L = show * pitch;
  const drape = (s) => { const k = s / L - 0.5; return V(k * L * 0.36, -(1 - (2 * k) ** 2) * L * 0.17, 0); };
  const base = linkGeometry(Li, Wi, d, p.linkType);
  for (let i = 0; i < show; i++) {
    const s = i * pitch, a = drape(s), b = drape(s + pitch);
    const g = base.clone();
    if (p.linkType !== 'curb' && i % 2) g.rotateX(Math.PI / 2);
    if (p.linkType === 'curb') g.rotateX((i % 2 ? 1 : -1) * 0.5);
    g.rotateZ(Math.atan2(b.y - a.y, b.x - a.x));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    geos.push(g);
  }
  const parts = [{ name: `Chain links (${count})`, layer: 'Chain', kind: 'metal', pieces: geos, analyticVolume: vol, display: true }];
  const meta = { type: 'chain', linkCount: count, wireDia: d, linkInnerL: Li, linkInnerW: Wi, lengthMm: total, claspWeight: p.claspWeight, linkClearance: Wi - 2 * d, analyticVolume: vol, minThickness: d };
  return { parts, cutters: [], meta };
}
function linkGeometry(Li, Wi, d, type) {
  const Lc = Li + d, Wc = Wi + d, pts = [];
  const r = Wc / 2, straight = Math.max(0, Lc - Wc);
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * 2 * Math.PI;
    let x = Math.cos(t) * r + Math.sign(Math.cos(t)) * straight / 2, y = Math.sin(t) * r;
    pts.push(V(x, y, 0));
  }
  return tube(pts, d / 2, { closed: true, segments: 40, radial: 8 });
}
