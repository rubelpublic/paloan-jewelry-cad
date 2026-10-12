// Image → 3D: background removal, height maps, contour tracing and jewelry auto-detection.
// Everything runs locally on a small raster (≤ 320 px), nothing is uploaded.
import { caratFromDims } from './data.js';

/** Shared image state used by the relief builder and signet faces. */
export const imageStore = { raster: null, mask: null, height: null, w: 0, h: 0, name: '', thumb: '', version: 0, contour: null, opts: null };

export async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read image')); i.src = url; });
    return { img, name: file.name };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

export function rasterize(img, maxDim = 320) {
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(8, Math.round((img.naturalWidth || img.width) * s)), h = Math.max(8, Math.round((img.naturalHeight || img.height) * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  const thumbC = document.createElement('canvas'); const ts = Math.min(1, 160 / Math.max(w, h)); thumbC.width = Math.round(w * ts); thumbC.height = Math.round(h * ts);
  thumbC.getContext('2d').drawImage(c, 0, 0, thumbC.width, thumbC.height);
  return { w, h, rgba: x.getImageData(0, 0, w, h).data, thumb: thumbC.toDataURL('image/jpeg', 0.8) };
}

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d > 1e-6) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, mx ? d / mx : 0, mx];
}

function otsu(vals) {
  const hist = new Float64Array(256);
  for (const v of vals) hist[Math.max(0, Math.min(255, Math.round(v * 255)))]++;
  const total = vals.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  return thr / 255;
}

function morph(mask, w, h, r, dilate) {
  if (r <= 0) return mask;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let dy = -r; dy <= r && (dilate ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = x + dx, yy = y + dy;
      const m = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : mask[yy * w + xx];
      if (dilate && m) { v = 1; break; }
      if (!dilate && !m) { v = 0; break; }
    }
    out[y * w + x] = v;
  }
  return out;
}

/** Label 4-connected components of value `val`. Returns {labels, sizes, touchesBorder[]} */
function components(mask, w, h, val = 1) {
  const labels = new Int32Array(mask.length).fill(-1), sizes = [], border = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== val || labels[s] >= 0) continue;
    const id = sizes.length; let n = 0, tb = false;
    stack.push(s); labels[s] = id;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tb = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && mask[q] === val && labels[q] < 0) { labels[q] = id; stack.push(q); }
      }
    }
    sizes.push(n); border.push(tb);
  }
  return { labels, sizes, border };
}

/**
 * Foreground mask. opts: { mode: 'auto'|'color'|'luma'|'alpha', threshold: null|0..1, invert, fillHoles, keepLargest, smooth }
 */
export function computeMask(R, opts = {}) {
  const { w, h, rgba } = R;
  const n = w * h;
  let mode = opts.mode || 'auto';
  let transparent = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) transparent++;
  if (mode === 'auto') mode = transparent > n * 0.02 ? 'alpha' : 'color';
  const score = new Float32Array(n);
  if (mode === 'alpha') for (let i = 0; i < n; i++) score[i] = rgba[i * 4 + 3] / 255;
  else {
    // background = median of the border ring
    const br = [], bg = [], bb = [];
    const ring = Math.max(1, Math.round(Math.min(w, h) * 0.03));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x >= ring && y >= ring && x < w - ring && y < h - ring) continue;
      const k = (y * w + x) * 4; br.push(rgba[k]); bg.push(rgba[k + 1]); bb.push(rgba[k + 2]);
    }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    const B = [med(br), med(bg), med(bb)], BL = luma(...B);
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      score[i] = mode === 'luma' ? Math.abs(luma(rgba[k], rgba[k + 1], rgba[k + 2]) - BL)
        : Math.min(1, Math.hypot(rgba[k] - B[0], rgba[k + 1] - B[1], rgba[k + 2] - B[2]) / 255);
    }
  }
  const thr = opts.threshold == null ? Math.max(0.04, otsu(score)) : opts.threshold;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = (score[i] > thr) !== !!opts.invert ? 1 : 0;
  const sm = opts.smooth ?? 1;
  if (sm > 0) { mask = morph(morph(mask, w, h, sm, true), w, h, sm, false); mask = morph(morph(mask, w, h, sm, false), w, h, sm, true); }
  if (opts.keepLargest !== false) {
    const c = components(mask, w, h, 1);
    if (c.sizes.length > 1) {
      const big = c.sizes.indexOf(Math.max(...c.sizes));
      const minKeep = c.sizes[big] * 0.08;              // keep big secondary parts (e.g. earring pairs), drop specks
      for (let i = 0; i < n; i++) if (mask[i] && c.sizes[c.labels[i]] < minKeep) mask[i] = 0;
    }
  }
  if (opts.fillHoles) {
    const c = components(mask, w, h, 0);
    for (let i = 0; i < n; i++) if (!mask[i] && !c.border[c.labels[i]]) mask[i] = 1;
  }
  return { mask, score, threshold: thr, mode };
}

/** Height map 0..1 from luminance inside the mask (percentile-normalised, optional blur/invert). */
export function heightMap(R, mask, { invert = false, blur = 1, contrast = 1 } = {}) {
  const { w, h, rgba } = R, n = w * h;
  let H = new Float32Array(n);
  const vals = [];
  for (let i = 0; i < n; i++) { const k = i * 4; H[i] = luma(rgba[k], rgba[k + 1], rgba[k + 2]); if (mask[i]) vals.push(H[i]); }
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor(vals.length * 0.02)] ?? 0, hi = vals[Math.floor(vals.length * 0.98)] ?? 1;
  for (let i = 0; i < n; i++) {
    let v = mask[i] ? (H[i] - lo) / Math.max(1e-3, hi - lo) : 0;
    v = Math.max(0, Math.min(1, v));
    if (invert && mask[i]) v = 1 - v;
    v = Math.pow(v, 1 / Math.max(0.2, contrast));
    H[i] = mask[i] ? v : 0;
  }
  for (let pass = 0; pass < Math.round(blur); pass++) {
    const T = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
        s += H[yy * w + xx] * wgt; c += wgt;
      }
      T[y * w + x] = s / c;
    }
    H = T;
  }
  return H;
}

/** Outer contour of the largest component (Moore-neighbour tracing), simplified and smoothed. Pixel coords. */
export function traceContour(mask, w, h) {
  const c = components(mask, w, h, 1);
  if (!c.sizes.length) return null;
  const big = c.sizes.indexOf(Math.max(...c.sizes));
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && c.labels[y * w + x] === big;
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) { sx = x; sy = y; break outer; }
  // Moore-neighbour tracing, clockwise (screen coords), backtrack kept as an absolute pixel
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts = [[sx, sy]];
  let cx = sx, cy = sy, bx = sx - 1, by = sy;
  for (let guard = 0; guard < w * h * 4; guard++) {
    const d = dirs.findIndex(([dx, dy]) => cx + dx === bx && cy + dy === by);
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const nd = (d + k) % 8, nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (inside(nx, ny)) {
        const pd = (d + k - 1) % 8;
        bx = cx + dirs[pd][0]; by = cy + dirs[pd][1];
        cx = nx; cy = ny; found = true; break;
      }
    }
    if (!found || (cx === sx && cy === sy)) break;
    pts.push([cx, cy]);
  }
  if (pts.length < 8) return null;
  let poly = rdp(pts, 0.8);
  for (let it = 0; it < 2; it++) poly = chaikin(poly);
  return poly;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.abs(dy * px - dx * py + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
  return [a, b];
}
function chaikin(p) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** Convert a pixel contour into a centred mm outline [[x, y]] (y up) of a given width. */
export function contourToMM(poly, widthMM) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = widthMM / Math.max(1e-6, x1 - x0);
  return { outline: poly.map(([x, y]) => [(x - (x0 + x1) / 2) * s, -(y - (y0 + y1) / 2) * s]), heightMM: (y1 - y0) * s };
}

/** Holes inside the foreground (enclosed background regions). */
export function holeStats(mask, w, h) {
  const c = components(mask, w, h, 0);
  const holes = c.sizes.map((s, i) => ({ s, i })).filter((o) => !c.border[o.i]).sort((a, b) => b.s - a.s);
  let cx = 0, cy = 0;
  if (holes.length) {
    let n = 0;
    for (let p = 0; p < mask.length; p++) if (c.labels[p] === holes[0].i && !mask[p]) { cx += p % w; cy += Math.floor(p / w); n++; }
    cx /= n; cy /= n;
  }
  return { count: holes.length, largest: holes[0]?.s || 0, centre: [cx, cy] };
}

/** Heuristic jewelry recognition from a product photo / render. */
export function analyzeImage(R, maskInfo) {
  const { w, h, rgba } = R, mask = maskInfo.mask;
  let x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (!area) return { ok: false, notes: ['No foreground found — adjust the threshold or invert the mask.'] };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, aspect = bh / bw;
  const holes = holeStats(mask, w, h);
  const holeRatio = holes.largest / (bw * bh);
  // colour statistics of the metal (moderately bright, not specular)
  let hx = 0, hy = 0, sat = 0, val = 0, nm = 0;
  const gemPix = [], sparkle = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const [H, S, V] = hsv(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (V > 0.93 && S < 0.12) { sparkle.push(i); continue; }
    if (V > 0.18 && V < 0.93) { hx += Math.cos(H * Math.PI / 180) * S; hy += Math.sin(H * Math.PI / 180) * S; sat += S; val += V; nm++; }
    if (S > 0.45 && V > 0.2) gemPix.push([i, H]);
  }
  sat /= Math.max(1, nm); val /= Math.max(1, nm);
  const hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
  let metal = '18ky', metalName = 'yellow gold';
  if (sat < 0.16) { metal = val > 0.45 ? '18kw' : 'ag925'; metalName = val > 0.45 ? 'white gold / platinum' : 'silver (oxidised)'; }
  else if (hue < 28 || hue > 335) { metal = '18kr'; metalName = 'rose gold'; }
  // coloured gems: saturated pixels whose hue differs from the metal hue
  const metalHue = hue;
  const gemHues = gemPix.filter(([, H]) => Math.min(Math.abs(H - metalHue), 360 - Math.abs(H - metalHue)) > 40);
  let gem = null, gemName = '';
  if (gemHues.length > area * 0.01) {
    let gx = 0, gy = 0; for (const [, H] of gemHues) { gx += Math.cos(H * Math.PI / 180); gy += Math.sin(H * Math.PI / 180); }
    const gh = ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 360;
    [gem, gemName] = gh >= 190 && gh < 260 ? ['sapphire', 'blue sapphire'] : gh >= 80 && gh < 190 ? ['emerald', 'emerald'] : gh >= 260 && gh < 300 ? ['amethyst', 'amethyst'] : gh >= 300 && gh < 345 ? ['tourmaline', 'pink tourmaline'] : ['ruby', 'ruby'];
  }
  const stonePix = gem ? gemHues.map(([i]) => i) : sparkle.length > area * 0.006 ? sparkle : [];
  let stone = null;
  if (stonePix.length) {
    // largest compact cluster: take bbox of pixels within the densest 60% around the median
    const xs = stonePix.map((i) => i % w).sort((a, b) => a - b), ys = stonePix.map((i) => Math.floor(i / w)).sort((a, b) => a - b);
    const q = (a, f) => a[Math.floor(a.length * f)];
    const sx0 = q(xs, 0.1), sx1 = q(xs, 0.9), sy0 = q(ys, 0.1), sy1 = q(ys, 0.9);
    stone = { cx: (sx0 + sx1) / 2, cy: (sy0 + sy1) / 2, wFrac: (sx1 - sx0 + 1) / bw, hFrac: (sy1 - sy0 + 1) / bh };
  }
  // jagged outline → spikes / gothic
  let spikes = 0;
  const poly = traceContour(mask, w, h);
  if (poly && poly.length > 10) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i - 3 + poly.length) % poly.length], b = poly[i], c = poly[(i + 3) % poly.length];
      const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1))));
      if (ang < 0.9) spikes++;
    }
    spikes = Math.round(spikes / 3);
  }
  const comps = components(mask, w, h, 1);
  const bigComps = comps.sizes.filter((s) => s > area * 0.2).length;
  // classify
  const notes = [];
  let type = 'pendant', params = { metal };
  const ringLike = holes.count > 0 && holeRatio > 0.08 && aspect > 0.6 && aspect < 1.9 && Math.abs(holes.centre[0] - (x0 + bw / 2)) < bw * 0.2;
  if (bigComps >= 2) {
    type = 'earring';
    params = { metal, earType: aspect > 1.3 ? 'drop' : 'stud', pair: true, headType: stone ? 'prong' : 'bezel', cut: 'round', carat: 0.5 };
    notes.push('Two similar shapes found → a pair of earrings.');
  } else if (ringLike) {
    type = 'ring';
    const outerD = 21;                                    // typical outer Ø of a US 6–7 ring in a product shot
    const sc = outerD / bw;
    const band = Math.max(1.6, Math.min(8, ((bw - Math.sqrt(holes.largest / Math.PI) * 2) / 2) * sc * 0.55));
    params = { metal, ringSize: 6.5, widthTop: +band.toFixed(2), widthBottom: +Math.max(1.6, band * 0.85).toFixed(2), headType: 'none' };
    if (stone) {
      const sw = Math.max(2.5, Math.min(12, stone.wFrac * bw * sc));
      const cut = stone.hFrac / Math.max(1e-3, stone.wFrac) > 1.25 ? 'oval' : 'round';
      params = { ...params, headType: 'prong', cut, gem: gem || 'diamond', sizeMode: 'mm', stoneW: +sw.toFixed(2), stoneL: +(cut === 'oval' ? sw * 1.4 : sw).toFixed(2) };
      params.carat = +caratFromDims(cut, params.stoneL, params.stoneW, params.gem).toFixed(2);
      notes.push(`Centre stone ≈ ${params.stoneL} × ${params.stoneW} mm (${params.carat} ct) — scale assumed from a ${outerD} mm outer diameter.`);
    }
    if (spikes >= 6) { params.spikes = Math.min(24, spikes); params.style = 'gothic'; notes.push(`${spikes} spike-like points on the outline → gothic spikes.`); }
    notes.push(`Finger hole detected (${(holeRatio * 100).toFixed(0)}% of the silhouette).`);
  } else {
    type = 'pendant';
    params = { metal, shape: 'custom', height: +(20 * Math.min(2.2, Math.max(0.5, aspect))).toFixed(1), width: 20, headType: stone ? 'bezel' : 'none' };
    if (stone) {
      params.cut = stone.hFrac / Math.max(1e-3, stone.wFrac) > 1.3 ? 'pear' : 'round';
      params.gem = gem || 'diamond'; params.sizeMode = 'mm';
      params.stoneW = +Math.max(2, Math.min(14, stone.wFrac * 20)).toFixed(2);
      params.stoneL = +(params.cut === 'pear' ? params.stoneW * 1.5 : params.stoneW).toFixed(2);
      params.stoneY = +(-(stone.cy - (y0 + bh / 2)) / bh * params.height).toFixed(2);
    }
    if (spikes >= 6) { params.spikes = Math.min(30, spikes); notes.push(`${spikes} sharp points → perimeter spikes.`); }
    if (holes.count > 2) { params.openwork = 'circle'; notes.push(`${holes.count} pierced openings → openwork.`); }
    notes.push(`Silhouette ${bw}×${bh} px → ${params.width} × ${params.height} mm outline (change Width to rescale).`);
  }
  notes.unshift(`Metal looks like ${metalName}${gem ? `, coloured stone: ${gemName}` : stone ? ', colourless stone (diamond-like sparkle)' : ''}.`);
  return { ok: true, type, params, notes, metrics: { aspect, holes, holeRatio, spikes, sat, val, hue, stone, area, bbox: [x0, y0, bw, bh] } };
}

/** Sample the stored field at normalised (u, v) ∈ [0,1]² (v down). Returns {m: 0/1, h: 0..1}. */
export function sampleField(u, v) {
  const S = imageStore;
  if (!S.mask) return null;
  const x = Math.min(S.w - 1, Math.max(0, u * (S.w - 1))), y = Math.min(S.h - 1, Math.max(0, v * (S.h - 1)));
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const at = (a, xx, yy) => a[Math.min(S.h - 1, yy) * S.w + Math.min(S.w - 1, xx)];
  const bil = (a) => (at(a, xi, yi) * (1 - fx) + at(a, xi + 1, yi) * fx) * (1 - fy) + (at(a, xi, yi + 1) * (1 - fx) + at(a, xi + 1, yi + 1) * fx) * fy;
  return { m: bil(S.mask) > 0.5 ? 1 : 0, h: bil(S.height) };
}

/** Process an image into the store with the given options. */
export function processImage(R, opts) {
  const mk = computeMask(R, opts);
  const H = heightMap(R, mk.mask, { invert: !!opts.heightInvert, blur: opts.blur ?? 1, contrast: opts.contrast ?? 1 });
  Object.assign(imageStore, { raster: R, w: R.w, h: R.h, mask: mk.mask, height: H, thumb: R.thumb, opts: { ...opts }, version: imageStore.version + 1, contour: traceContour(mk.mask, R.w, R.h), maskInfo: mk });
  return mk;
}

/** Compact serialisation for project files. */
export function exportField() {
  const S = imageStore;
  if (!S.mask) return null;
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const hq = new Uint8Array(S.height.length); for (let i = 0; i < hq.length; i++) hq[i] = Math.round(S.height[i] * 255);
  return { w: S.w, h: S.h, mask: toB64(S.mask), height: toB64(hq), thumb: S.thumb, name: S.name };
}
export function importField(f) {
  if (!f) return;
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const m = fromB64(f.mask), hq = fromB64(f.height);
  const H = new Float32Array(hq.length); for (let i = 0; i < hq.length; i++) H[i] = hq[i] / 255;
  Object.assign(imageStore, { w: f.w, h: f.h, mask: m, height: H, thumb: f.thumb, name: f.name || 'project image', version: imageStore.version + 1, contour: traceContour(m, f.w, f.h) });
}
