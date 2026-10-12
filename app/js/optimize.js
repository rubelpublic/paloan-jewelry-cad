// Weight optimiser: hit a target metal weight by hollowing first, then thickness, then width,
// never going below the casting minimums used by the validator.
import { generate, measure } from './engine.js';

const SOFT = new Set(['ag925', '24k', '22k']);

function stagesFor(type, p, metal) {
  const soft = SOFT.has(metal) ? 0.2 : 0;
  const tex = p.texture && p.texture !== 'none' ? p.textureDepth || 0 : 0;
  const S = [];
  const minWall = 0.6 + soft / 2;
  // when thinning a hollowed body, shrink the hollow so the remaining wall never drops below the minimum
  const keepWall = (q, t) => { if (q.backHollow) q.hollowDepth = +Math.max(0.05, Math.min(q.hollowDepth, t - minWall - tex)).toFixed(3); };
  if (type === 'ring') {
    if ((p.shankStyle || 'classic') === 'classic') S.push({ label: 'Back hollow depth', key: 'hollowDepth', unit: 'mm', lo: 0.05, hi: Math.max(0.06, Math.min(p.thickBottom, p.thickTop) - minWall - tex), heavierWhenHigh: false, prep: (q) => { q.backHollow = true; q.hollowRail = Math.max(q.hollowRail || 0.8, 0.8); }, onlyReduce: true });
    const t0b = p.thickBottom, t0t = p.thickTop, minB = 1.3 + soft;
    S.push({ label: 'Shank thickness', unit: '×', lo: Math.min(1, minB / t0b), hi: 1.6, heavierWhenHigh: true, set: (q, x) => { q.thickBottom = +(t0b * x).toFixed(3); q.thickTop = +(t0t * x).toFixed(3); keepWall(q, Math.min(q.thickBottom, q.thickTop)); } });
    const w0b = p.widthBottom, w0t = p.widthTop;
    S.push({ label: 'Band width', unit: '×', lo: Math.min(1, 1.6 / w0b), hi: 1.6, heavierWhenHigh: true, set: (q, x) => { q.widthBottom = +(w0b * x).toFixed(3); q.widthTop = +(w0t * x).toFixed(3); } });
  } else if (type === 'pendant') {
    S.push({ label: 'Back hollow (front wall)', key: 'frontWall', unit: 'mm', lo: 0.6 + soft / 2, hi: Math.max(0.61, p.thickness - 0.25), heavierWhenHigh: true, prep: (q) => { q.backHollow = true; }, onlyReduce: true });
    const t0 = p.thickness;
    S.push({ label: 'Plate thickness', unit: '×', lo: Math.min(1, (0.9 + soft) / t0), hi: 1.8, heavierWhenHigh: true, set: (q, x) => { q.thickness = +(t0 * x).toFixed(3); if (q.backHollow) q.frontWall = Math.min(q.frontWall, q.thickness - 0.25); } });
  } else if (type === 'bangle') {
    S.push({ label: 'Inside hollow depth', key: 'hollowDepth', unit: 'mm', lo: 0.05, hi: Math.max(0.06, p.thickness - minWall - tex), heavierWhenHigh: false, prep: (q) => { q.backHollow = true; }, onlyReduce: true });
    const t0 = p.thickness, w0 = p.width;
    S.push({ label: 'Thickness', unit: '×', lo: Math.min(1, (1.6 + soft) / t0), hi: 1.6, heavierWhenHigh: true, set: (q, x) => { q.thickness = +(t0 * x).toFixed(3); keepWall(q, q.thickness); } });
    S.push({ label: 'Width', unit: '×', lo: Math.min(1, 3 / w0), hi: 1.8, heavierWhenHigh: true, set: (q, x) => { q.width = +(w0 * x).toFixed(3); } });
  } else if (type === 'earring') {
    if (p.earType === 'hoop') {
      const t0 = p.hoopThick, w0 = p.hoopWidth;
      S.push({ label: 'Hoop thickness', unit: '×', lo: Math.min(1, 1.0 / t0), hi: 1.8, heavierWhenHigh: true, set: (q, x) => { q.hoopThick = +(t0 * x).toFixed(3); } });
      S.push({ label: 'Hoop width', unit: '×', lo: Math.min(1, 1.5 / w0), hi: 1.8, heavierWhenHigh: true, set: (q, x) => { q.hoopWidth = +(w0 * x).toFixed(3); } });
    } else if (p.earType === 'drop') {
      const t0 = p.dropThick;
      S.push({ label: 'Drop thickness', unit: '×', lo: Math.min(1, 0.9 / t0), hi: 1.8, heavierWhenHigh: true, set: (q, x) => { q.dropThick = +(t0 * x).toFixed(3); } });
    }
  } else if (type === 'relief') {
    const b0 = p.base;
    S.push({ label: 'Base thickness', unit: '×', lo: Math.min(1, (0.8 + soft) / b0), hi: 2, heavierWhenHigh: true, set: (q, x) => { q.base = +(b0 * x).toFixed(3); } });
  } else if (type === 'name') {
    const t0 = p.thickness;
    S.push({ label: 'Letter thickness', unit: '×', lo: Math.min(1, (0.8 + soft) / t0), hi: 2, heavierWhenHigh: true, set: (q, x) => { q.thickness = +(t0 * x).toFixed(3); } });
  } else if (type === 'chain') {
    const d0 = p.wireDia;
    S.push({ label: 'Wire diameter', unit: '×', lo: Math.min(1, 0.6 / d0), hi: 2, heavierWhenHigh: true, set: (q, x) => { q.wireDia = +(d0 * x).toFixed(3); } });
  }
  return S;
}

/**
 * Returns { params, grams, log[] }. onProgress(text) is called between evaluations.
 */
export async function optimizeWeight(type, params, metal, target, onProgress = () => {}) {
  let p = structuredClone(params);
  const weigh = (q) => measure(generate(type, q, { csg: true }), metal, { res: 110 }).grams;
  const startW = weigh(p);
  let w = startW;
  const log = [`Start: ${startW.toFixed(2)} g → target ${target.toFixed(2)} g`];
  const tick = () => new Promise((r) => setTimeout(r, 0));
  for (const st of stagesFor(type, p, metal)) {
    if (Math.abs(w - target) / target < 0.01) break;
    const need = w > target ? 'lighter' : 'heavier';
    if (st.onlyReduce && need === 'heavier') continue;
    const q0 = structuredClone(p);
    if (st.prep) st.prep(q0);
    const set = st.set || ((q, x) => { q[st.key] = +x.toFixed(3); });
    const at = (x) => { const q = structuredClone(q0); set(q, x); return q; };
    let lo = st.lo, hi = st.hi;
    if (hi <= lo) continue;
    // weight is monotonic in x; find x where weight = target
    const wLo = weigh(at(lo)), wHi = weigh(at(hi));
    await tick(); onProgress(`${st.label}…`);
    const minW = Math.min(wLo, wHi), maxW = Math.max(wLo, wHi);
    let x;
    if (target <= minW) x = wLo < wHi ? lo : hi;
    else if (target >= maxW) x = wLo > wHi ? lo : hi;
    else {
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2, wm = weigh(at(mid));
        await tick(); onProgress(`${st.label}: ${mid.toFixed(3)} ${st.unit} → ${wm.toFixed(2)} g`);
        const heavier = st.heavierWhenHigh ? wm > target : wm < target;
        if (heavier) hi = mid; else lo = mid;
      }
      x = (lo + hi) / 2;
    }
    const q = at(x), wq = weigh(q);
    if (Math.abs(wq - target) < Math.abs(w - target) - 1e-4) {
      log.push(`${st.label} → ${x.toFixed(3)} ${st.unit}: ${w.toFixed(2)} g → ${wq.toFixed(2)} g (${wq < w ? 'saves' : 'adds'} ${Math.abs(w - wq).toFixed(2)} g)`);
      p = q; w = wq;
    }
  }
  const off = (w - target) / target;
  log.push(Math.abs(off) <= 0.05
    ? `Result ${w.toFixed(2)} g (${(off * 100).toFixed(1)}% from target) — within ±5% production tolerance.`
    : `Closest manufacturable result ${w.toFixed(2)} g (${(off * 100).toFixed(1)}%). Going further would break minimum wall/width rules — change the design (stone size, openwork, dimensions).`);
  return { params: p, grams: w, start: startW, log };
}
