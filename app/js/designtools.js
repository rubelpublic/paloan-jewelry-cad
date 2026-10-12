// Design helpers that make complex work easy: one-click Auto-fix, matching jewelry sets, style mixer.
import { RULES } from './data.js';
import { STYLE_PRESETS } from './presets.js';
import { SCHEMAS } from './schema.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** Parameter changes that resolve validator failures/warnings. Returns { patch, fixes[] }. */
export function autoFixPatch(type, p, meta, checks) {
  const patch = {}, fixes = [];
  const set = (k, v, why) => { if (v === undefined || p[k] === v || patch[k] === v) return; patch[k] = v; fixes.push(`${why}: ${k} ${p[k] ?? '—'} → ${v}`); };
  const titles = new Set(checks.filter((c) => c.level === 'fail' || c.level === 'warn').map((c) => c.title));
  const has = (t) => titles.has(t);
  const soft = ['ag925', '24k', '22k'].includes(p.metal) ? 0.25 : 0;
  if (has('Shank too thin') || has('Shank on the thin side')) {
    const need = r2((type === 'bangle' ? 1.8 : RULES.ringShankMinWarn) + soft + 0.05 + (p.texture && p.texture !== 'none' ? p.textureDepth || 0 : 0));
    if (type === 'bangle') set('thickness', Math.max(p.thickness, need), 'Shank thickness');
    else { set('thickBottom', Math.max(p.thickBottom, need), 'Shank thickness'); if (p.thickTop < need) set('thickTop', need, 'Shank thickness'); }
  }
  if (has('Narrow band')) { if (type === 'bangle') set('width', 3, 'Band width'); else { set('widthBottom', Math.max(p.widthBottom, p.shankStyle === 'split' ? 3.2 : 1.8), 'Band width'); if (p.widthTop < 1.8) set('widthTop', 1.8, 'Band width'); } }
  if (has('Prongs undersized') && meta.stone) set('prongDia', 0, 'Prong Ø back to auto (sized from the stone)');
  if (has('Large stone on few prongs')) set('prongCount', 6, 'Large stone');
  if (has('Unprotected points')) set('prongCount', p.cut === 'marquise' ? 6 : 5, 'V-prongs on points');
  if (has('Corners exposed')) set('prongCount', 4, 'Corner prongs');
  if (has('Bezel wall too thin') || has('Collet wall too thin')) set('bezelWall', 0.7, 'Wall');
  if (has('Halo stones colliding') || has('Loose halo spacing')) set('haloGap', 0.15, 'Halo spacing');
  if (has('Tiny shared beads')) set('haloStone', Math.max(p.haloStone, 1.5), 'Bead size');
  if (has('Culet hits the shank')) set('galleryLift', r2(Math.max(p.galleryLift + 0.5, 0.6)), 'Culet clearance');
  if (has('Tall setting')) set('galleryLift', r2(Math.max(0.3, p.galleryLift - (meta.headHeight - RULES.headHeightWarn) - 0.2)), 'Lower head');
  if (has('Pavé does not fit the band')) { set('widthTop', r2(Math.max(p.widthTop, (p.accentSize || 1.3) + 0.8)), 'Room for pavé'); }
  if (has('Fragile spikes')) set('spikeBase', Math.max(p.spikeBase, 1.1), 'Spike base');
  if (has('Spikes too slender') || has('Long spikes')) set('spikeLen', r2(Math.max(p.spikeBase, patch.spikeBase || 0) * 2.4), 'Spike length');
  if (has('Openwork bridges too thin') || has('Delicate openwork')) {
    if (type === 'ring') set('openSize', r2(Math.max(0.2, (p.openSize || 0.55) - 0.1)), 'Wider bridges');
    else set('openBridge', Math.max(p.openBridge || 0.9, 0.9), 'Wider bridges');
  }
  if (has('Holes too small to clean')) { if (type === 'ring') set('openSize', r2((p.openSize || 0.5) + 0.08), 'Bigger windows'); else set('openSize', Math.max(p.openSize, 0.8), 'Bigger holes'); }
  if (has('Hollow wall too thin')) {
    if (type === 'pendant') set('frontWall', Math.max(p.frontWall, 0.7), 'Hollow wall');
    else set('hollowDepth', r2(Math.max(0.05, (meta.hollowDepth || p.hollowDepth) - (0.65 - meta.hollowWall))), 'Hollow wall');
  }
  if (has('Narrow hollow rails')) set(type === 'pendant' ? 'rim' : 'hollowRail', 0.9, 'Hollow rails');
  if (has('Hinge will seize') || has('Sloppy hinge')) set('hingeClearance', 0.1, 'Hinge');
  if (has('Non-standard post')) set('postDia', 0.8, 'Ear post');
  if (has('Small bail')) set('bailInner', 3.2, 'Bail');
  if (has('Fine chain wire')) set('wireDia', 0.6, 'Chain wire');
  if (has('Links cannot articulate')) set('linkInnerW', r2(2 * (patch.wireDia || p.wireDia) + 0.4), 'Link opening');
  if (has('Thin pendant plate')) set('thickness', 1.4, 'Plate');
  if (has('Signet plate too thin')) set('signetT', 1.4, 'Signet plate');
  if (has('Face cut too deep')) set('faceDepth', r2(Math.max(0.1, (patch.signetT || p.signetT) - 0.6)), 'Face depth');
  if (has('Tiny engraving')) set('engraveSize', 1.4, 'Engraving size');
  if (has('Deep engraving')) set('engraveDepth', 0.15, 'Engraving depth');
  if (has('Engraving too long')) set('engraveSize', r2(Math.max(0.9, (p.engraveSize || 1.6) * 0.75)), 'Engraving size');
  if (has('Letters are not connected')) { if (p.dots !== 'remove') set('dots', 'remove', 'Floating dots'); else set('bar', 'underline', 'Connect letters'); }
  if (has('Strokes too thin') || has('Delicate strokes')) set('letterHeight', r2(Math.min(30, p.letterHeight * 1.25)), 'Stroke width');
  if (has('Thin name plate')) set('thickness', 1.2, 'Name thickness');
  if (has('Base too thin')) set('base', 1.2, 'Relief base');
  if (has('Very deep relief')) set('depth', 1.2, 'Relief depth');
  if (has('Petal edges too thin') || has('Delicate petal tips')) set('petalThick', Math.max(p.petalThick, 1.0), 'Petal thickness');
  if (has('Thin metal around flush stone')) set('flushMargin', 1.0, 'Flush margin');
  if (has('Fine monogram strokes')) set('faceDepth', r2(Math.min(p.faceDepth, 0.4)), 'Monogram depth');
  if (has('Coil wire')) set('coils', 0, 'Fragile coils removed');
  return { patch, fixes, needsWeight: has('Weight off target') };
}

/** A matching set (ring, pendant, studs, bangle) sharing metal, style, stone and ornaments of the current design. */
export function matchingSet(type, p) {
  const shared = { metal: p.metal, finish: p.finish, headMetal: p.headMetal, style: p.style, cut: p.cut || 'round', gem: p.gem || 'diamond', headType: p.headType && p.headType !== 'none' ? p.headType : 'bezel', prongStyle: p.prongStyle, prongCount: p.prongCount,
    petals: p.petals || 0, petalLayers: p.petalLayers, petalTip: p.petalTip, petalEnamel: p.petalEnamel, petalLift: p.petalLift, petalCurl: p.petalCurl,
    spikes: p.spikes ? Math.max(10, p.spikes) : 0, spikeBase: p.spikeBase, spikeLen: p.spikeLen, milgrain: p.milgrain, openwork: p.openwork && p.openwork !== 'none' ? 'circle' : 'none', texture: p.texture };
  const preset = (t) => ({ ...structuredClone(SCHEMAS[t].defaults), ...(STYLE_PRESETS[t]?.[p.style] || {}) });
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const items = [];
  if (type !== 'ring') items.push({ type: 'ring', label: 'Matching ring', params: clean({ ...preset('ring'), ...shared, carat: 0.8, sizeMode: 'carat', texture: shared.texture || 'none', openwork: 'none', spikes: shared.spikes ? 12 : 0 }) });
  if (type !== 'pendant') items.push({ type: 'pendant', label: 'Matching pendant', params: clean({ ...preset('pendant'), ...shared, sizeMode: 'carat', carat: 0.6, petals: shared.petals ? Math.max(6, shared.petals - 2) : 0, petalLength: 5.5, petalWidth: 2.8 }) });
  items.push({ type: 'earring', label: 'Matching studs (pair)', params: clean({ ...preset('earring'), ...shared, earType: 'stud', sizeMode: 'carat', carat: 0.35, spikes: 0, openwork: undefined, petals: shared.petals ? Math.max(5, shared.petals - 3) : 0, petalLength: 3.8, petalWidth: 2.0, petalLayers: 1 }) });
  items.push({ type: 'earring', label: 'Matching drops (pair)', params: clean({ ...preset('earring'), ...shared, earType: 'drop', sizeMode: 'carat', carat: 0.3, headType: 'bezel', petals: 0 }) });
  if (type !== 'bangle') items.push({ type: 'bangle', label: 'Matching bangle', params: clean({ ...preset('bangle'), metal: p.metal, finish: p.finish, texture: shared.texture || 'none', spikes: shared.spikes ? 22 : 0, width: 5 }) });
  items.push({ type: 'chain', label: 'Chain for the pendant', params: { ...preset('chain'), metal: p.metal, finish: p.finish, wireDia: 0.7 } });
  return items;
}

/** Blend two style presets: numbers interpolate, choices/booleans switch at 50 %. */
export function mixStyles(type, base, a, b, t) {
  const A = { ...base, ...(STYLE_PRESETS[type]?.[a] || {}) }, B = { ...base, ...(STYLE_PRESETS[type]?.[b] || {}) };
  const out = { ...base };
  for (const k of new Set([...Object.keys(STYLE_PRESETS[type]?.[a] || {}), ...Object.keys(STYLE_PRESETS[type]?.[b] || {})])) {
    const va = A[k], vb = B[k];
    if (typeof va === 'number' && typeof vb === 'number') out[k] = Math.round((va + (vb - va) * t) * 100) / 100;
    else if (typeof va === 'boolean' || typeof vb === 'boolean') out[k] = t < 0.5 ? !!va : !!vb;
    else out[k] = t < 0.5 ? va : vb;
  }
  // ornaments from the minor style survive above 30 % so the mix is visible
  for (const k of ['spikes', 'coils', 'petals', 'accentCount']) { const v = Math.max(A[k] || 0, B[k] || 0); if (v && Math.min(t, 1 - t) >= 0.3) out[k] = Math.round(v * 0.75); }
  out.style = t < 0.5 ? a : b;
  return out;
}
