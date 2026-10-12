// Manufacturability rules engine. Every check returns {level, title, detail, fix}.
import { RULES, METALS, CUTS } from './data.js';

const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

export function validate(model, m, params, metalKey) {
  // compare at 0.001 mm resolution so 0.5999999 does not fail a 0.6 mm rule
  const meta = Object.fromEntries(Object.entries(model.meta).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v])), out = [];
  const metal = METALS[metalKey] || METALS['18ky'];
  const soft = metalKey === 'ag925' || metalKey === '24k' || metalKey === '22k';
  const pt = metalKey === 'pt950';
  const add = (level, title, detail, fix = '') => out.push({ level, title, detail, fix });
  const type = model.type;

  // ---- shank / body thickness ----
  if (type === 'ring' || type === 'bangle') {
    const failT = (type === 'bangle' ? 1.4 : RULES.ringShankMinFail) + (soft ? 0.2 : 0) - (pt ? 0.1 : 0);
    const warnT = (type === 'bangle' ? 1.8 : RULES.ringShankMinWarn) + (soft ? 0.25 : 0) - (pt ? 0.1 : 0);
    const t = meta.minThickness;
    if (t < failT) add('fail', 'Shank too thin', `Thinnest shank section ${f(t)} mm < ${f(failT)} mm for ${metal.label}. It will bend out of round in daily wear.`, `Raise bottom thickness to ≥ ${f(warnT)} mm, or switch to a harder alloy.`);
    else if (t < warnT) add('warn', 'Shank on the thin side', `${f(t)} mm is castable but will deform over time (recommended ≥ ${f(warnT)} mm).`, 'Thicken the shank bottom by 0.2–0.3 mm or add a comfort-fit dome.');
    else add('pass', 'Shank thickness', `${f(t)} mm minimum — durable for ${metal.label}.`);
    if (meta.minWidth < RULES.ringWidthMin) add('warn', 'Narrow band', `Band width ${f(meta.minWidth)} mm. Bands under ${RULES.ringWidthMin} mm cut into the finger and bend easily.`, 'Increase bottom width to ≥ 1.6 mm (split shanks: each arm ≥ 1.3 mm).');
  }
  if (type === 'pendant' || (type === 'earring' && meta.earType === 'drop')) {
    if (meta.thickness < metal.minWall + 0.3) add('warn', 'Thin pendant plate', `${f(meta.thickness)} mm plate may warp during casting and polishing.`, `Use ≥ ${f(metal.minWall + 0.4)} mm, or hollow a thicker plate instead.`);
    else add('pass', 'Plate thickness', `${f(meta.thickness)} mm — stable for casting.`);
  }

  // ---- stone & setting ----
  if (meta.stone) {
    const s = meta.stone, minD = Math.min(s.L, s.W);
    add('info', 'Stone', `${CUTS[s.cut]?.label || s.cut} ${f(s.L)} × ${f(s.W)} mm (${f(s.carat, 2)} ct ${s.gem}).`);
    if (meta.headType === 'prong' || meta.headType === 'halo') {
      const need = RULES.prongDiaForStone(minD) * (pt ? 0.92 : 1);
      if (meta.prongDia < need - 0.05) add('fail', 'Prongs undersized', `Prong Ø ${f(meta.prongDia)} mm for a ${f(minD, 1)} mm stone (need ≥ ${f(need)} mm). Risk of stone loss after re-tipping.`, `Set prong diameter to ${f(need)} mm.`);
      else add('pass', 'Prong diameter', `Ø ${f(meta.prongDia)} mm (≥ ${f(need)} mm required).`);
      const cut = s.cut;
      if (minD > 7.5 && meta.prongCount < 6 && !CUTS[cut]?.corners) add('warn', 'Large stone on few prongs', `${meta.prongCount} prongs on a ${f(minD, 1)} mm stone.`, 'Use 6 prongs (or double claws) for stones over ~1.5 ct.');
      if ((cut === 'pear' || cut === 'heart' || cut === 'marquise') && meta.prongCount < (cut === 'marquise' ? 4 : 3)) add('fail', 'Unprotected points', `${cut} stones need V-prongs on the tip${cut === 'marquise' ? 's' : ''}.`, 'Increase prong count so every point has a V-prong.');
      if ((cut === 'princess' || cut === 'asscher') && meta.prongCount < 4) add('fail', 'Corners exposed', 'Princess/asscher corners chip easily.', 'Use 4 corner V-prongs.');
      const ov = meta.seatOverlap;
      if (ov < RULES.seatOverlapMin) add('warn', 'Shallow seat', `Prongs overlap the girdle by ${f(ov)} mm.`, 'Seat (bearing) should bite 0.1–0.3 mm into each prong.');
      else if (ov > RULES.seatOverlapMax) add('warn', 'Seat too deep', `Bearing cut ${f(ov)} mm weakens prongs.`, 'Keep bearing depth ≤ 30% of prong diameter.');
      else add('pass', 'Stone seat', `Bearing ${f(ov)} mm into each prong — secure and setter friendly.`);
    }
    if (meta.headType === 'bezel') {
      if (meta.bezelWall < RULES.bezelWallMin) add('fail', 'Bezel wall too thin', `${f(meta.bezelWall)} mm.`, 'Use ≥ 0.5 mm (0.6–0.8 mm for daily wear).');
      else add('pass', 'Bezel wall', `${f(meta.bezelWall)} mm wall, ${f(meta.bezelLip)} mm lip over the girdle.`);
    }
    if (meta.headType === 'halo') {
      if (meta.haloGap < RULES.haloGapMin) add('fail', 'Halo stones colliding', `Gap ${f(meta.haloGap)} mm between halo stones.`, 'Keep 0.08–0.25 mm between melee for setting tools.');
      else if (meta.haloGap > RULES.haloGapMax) add('warn', 'Loose halo spacing', `Gap ${f(meta.haloGap)} mm shows metal between melee.`, 'Reduce the gap or enlarge melee.');
      else add('pass', 'Halo spacing', `${meta.haloCount} × ${f(meta.haloStone)} mm melee, ${f(meta.haloGap)} mm apart.`);
      if (meta.beadDia < RULES.beadMin) add('warn', 'Tiny shared beads', `Bead Ø ${f(meta.beadDia)} mm.`, 'Beads under 0.5 mm wear off — enlarge the frame.');
    }
    if (type === 'ring') {
      if (meta.culetToShank < 0.2) add('fail', 'Culet hits the shank', `Culet ends ${f(meta.culetToShank)} mm above the shank.`, 'Raise gallery lift or cut a seat into the shank.');
      else add('pass', 'Culet clearance', `${f(meta.culetToShank)} mm between culet and shank — cleanable, no finger contact.`);
      if (meta.headHeight > RULES.headHeightWarn) add('warn', 'Tall setting', `Table sits ${f(meta.headHeight)} mm above the finger — snag risk.`, 'Lower gallery lift or use a bezel / low cathedral.');
    }
  }
  if (meta.accentCount) {
    if (meta.accentFit < 0.5) add('fail', 'Pavé does not fit the band', `Only ${f(meta.accentFit)} mm of metal beside ${f(meta.accentSize)} mm accents.`, 'Widen the top of the band or use smaller melee (≥ 0.25 mm metal each side).');
    else add('pass', 'Pavé fit', `${meta.accentCount} accents with ${f(meta.accentFit / 2)} mm metal each side.`);
  }

  // ---- ornament ----
  if (meta.spikeBase) {
    const ratio = meta.spikeLen / meta.spikeBase;
    if (meta.spikeBase < RULES.spikeBaseMin) add('fail', 'Fragile spikes', `Spike base Ø ${f(meta.spikeBase)} mm.`, `Use base ≥ ${RULES.spikeBaseMin} mm; wax spikes thinner than this break during spruing.`);
    else if (ratio > RULES.spikeRatioFail) add('fail', 'Spikes too slender', `Length/base ${f(ratio, 1)} : 1.`, `Keep ≤ ${RULES.spikeRatioWarn} : 1 — shorten to ${f(meta.spikeBase * RULES.spikeRatioWarn)} mm.`);
    else if (ratio > RULES.spikeRatioWarn) add('warn', 'Long spikes', `Length/base ${f(ratio, 1)} : 1 will bend if knocked.`, `Shorten to ${f(meta.spikeBase * RULES.spikeRatioWarn)} mm or widen the base.`);
    else add('pass', 'Spike stability', `${meta.spikeCount || ''} spikes, base ${f(meta.spikeBase)} mm, ratio ${f(ratio, 1)} : 1. Tips are left ~0.12 mm round for wearer safety.`);
  }
  if (meta.openwork && meta.openwork !== 'none') {
    const b = meta.openBridge;
    if (!Number.isFinite(b)) add('info', 'Openwork', 'No windows fitted at this size.');
    else if (b < RULES.bridgeFail) add('fail', 'Openwork bridges too thin', `Thinnest bridge ${f(b)} mm — will break during casting/polish.`, `Keep bridges ≥ ${RULES.bridgeWarn} mm (reduce window size or count).`);
    else if (b < RULES.bridgeWarn) add('warn', 'Delicate openwork', `Bridges ${f(b)} mm.`, `Recommended ≥ ${RULES.bridgeWarn} mm for gold, ≥ 1.0 mm for silver.`);
    else add('pass', 'Openwork bridges', `${f(b)} mm minimum bridge.`);
    if (meta.openHole < RULES.holeMin) add('warn', 'Holes too small to clean', `${f(meta.openHole)} mm windows fill with investment.`, `Keep holes ≥ ${RULES.holeMin} mm.`);
  }
  if (meta.hollowWall !== undefined) {
    if (meta.hollowWall < RULES.hollowWallMin) add('fail', 'Hollow wall too thin', `${f(meta.hollowWall)} mm wall left after hollowing.`, `Reduce hollow depth so ≥ ${RULES.hollowWallMin} mm remains.`);
    else add('pass', 'Hollowing wall', `${f(meta.hollowWall)} mm wall, ${f(meta.hollowRail)} mm rails.`);
    if (meta.hollowRail < RULES.hollowRailMin) add('warn', 'Narrow hollow rails', `${f(meta.hollowRail)} mm.`, 'Rails ≥ 0.8 mm keep the edges from collapsing during sizing.');
  }

  // ---- mechanisms / findings ----
  if (meta.hingeClearance !== undefined) {
    const c = meta.hingeClearance;
    if (c < RULES.hingeClearMin) add('fail', 'Hinge will seize', `Clearance ${f(c)} mm.`, 'Use 0.08–0.15 mm between knuckles (casting fills less).');
    else if (c > RULES.hingeClearMax) add('warn', 'Sloppy hinge', `Clearance ${f(c)} mm.`, 'Reduce to ≤ 0.15 mm.');
    else add('pass', 'Hinge clearance', `${f(c)} mm between knuckles.`);
  }
  if (type === 'earring' && meta.earType !== 'hoop') {
    if (meta.postDia < RULES.postDiaMin || meta.postDia > RULES.postDiaMax) add('warn', 'Non-standard post', `Post Ø ${f(meta.postDia)} mm.`, 'Standard ear post is 0.76–0.9 mm (20–21 gauge).');
    else add('pass', 'Ear post', `Ø ${f(meta.postDia)} mm × ${f(meta.postLen, 1)} mm.`);
    add('info', 'Findings', 'Use work-hardened wire posts (not cast) and friction backs; solder after casting.');
  }
  if (meta.bailInner !== undefined) {
    if (meta.bailInner < RULES.bailInnerMin) add('warn', 'Small bail', `Bail opening ${f(meta.bailInner)} mm.`, 'Use ≥ 3 mm so most chains and clasps pass.');
    else add('pass', 'Bail opening', `${f(meta.bailInner)} mm inner.`);
  }
  if (type === 'chain') {
    if (meta.wireDia < RULES.chainWireMin) add('warn', 'Fine chain wire', `${f(meta.wireDia)} mm.`, 'Use ≥ 0.6 mm for daily-wear gold chain.');
    if (meta.linkClearance < 0.15) add('fail', 'Links cannot articulate', `Inner opening leaves ${f(meta.linkClearance)} mm for the next link.`, 'Inner width must exceed 2 × wire Ø + 0.2 mm.');
    else add('pass', 'Link articulation', `${f(meta.linkClearance)} mm free play inside each link.`);
  }
  if (meta.coilWire) add(meta.coilWire < 0.6 ? 'warn' : 'pass', 'Coil wire', `Coil wire Ø ≈ ${f(meta.coilWire)} mm${meta.coilWire < 0.6 ? ' — fragile at the thin end' : ''}.`, meta.coilWire < 0.6 ? 'Keep curling wire ≥ 0.6 mm or fuse the coil to the base.' : '');
  if (meta.twistWire) add(meta.twistWire < 1.0 ? 'warn' : 'pass', 'Twisted strands', `Strand Ø ${f(meta.twistWire)} mm.`, meta.twistWire < 1.0 ? 'Strands under 1 mm fuse poorly; widen the band.' : '');

  // ---- gem spacing (all gems) & placed gems ----
  if (meta.gemGaps && meta.gemGaps.pairs) {
    const g = meta.gemGaps;
    if (g.collisions > 0) add('fail', 'Gems colliding', `${g.collisions} gem pair(s) closer than 0.05 mm (closest ${f(g.min, 3)} mm).`, 'Use ⇲ Compact to gap (0.1–0.2 mm) in 💎 Gems, or reduce stone size.');
    else if (g.min < 0.08) add('warn', 'Very tight gem spacing', `Closest girdles ${f(g.min, 3)} mm apart.`, 'Setters need 0.08–0.2 mm between stones.');
    else add('pass', 'Gem spacing', `Closest girdles ${f(g.min, 3)} mm apart — settable.`);
  }
  if (meta.placedGems) add('info', 'Placed gems', `${meta.placedGems.count} free-placed gems · ${f(meta.placedGems.ct, 3)} ct · seats cut by gem cutters.`);
  for (const pg of params.gems || []) {
    if (pg.prongs?.count > 0 && pg.prongs.dia < Math.max(0.3, Math.min(pg.L, pg.W) * 0.18)) { add('warn', 'Thin placed prongs', `Ø ${f(pg.prongs.dia)} mm on ${f(pg.L)} mm gems.`, `Use ≥ ${f(Math.max(0.3, Math.min(pg.L, pg.W) * 0.2))} mm.`); break; }
  }

  // ---- settings v1.2 ----
  if (meta.headType === 'collet') {
    if (meta.colletWall < RULES.bezelWallMin) add('fail', 'Collet wall too thin', `${f(meta.colletWall)} mm.`, 'Use ≥ 0.6 mm.');
    else add('pass', 'Collet', `${f(meta.colletHeight)} mm high, ${f(meta.colletWall)} mm wall, ${f(meta.colletTaper)} mm taper.`);
  }
  if (meta.headType === 'flush') {
    if (meta.flushMargin < 0.8) add('warn', 'Thin metal around flush stone', `${f(meta.flushMargin)} mm.`, 'Flush setting needs ≥ 0.8–1.0 mm of metal to hammer over the girdle.');
    else add('pass', 'Flush setting', `${f(meta.flushMargin)} mm of metal around the girdle.`);
    if (meta.stone && Math.min(meta.stone.L, meta.stone.W) > 6.5) add('warn', 'Large stone in flush setting', 'Flush/gypsy suits stones ≤ 6 mm.', 'Use a bezel or collet for bigger stones.');
  }
  if (meta.headType === 'double-prong') add('info', 'Double prongs', `${meta.prongCount} claws in pairs — more secure, slightly more metal over the stone.`);
  if (meta.headType === 'half-bezel') add('info', 'Half bezel', 'Open ends show the stone profile; keep wall ≥ 0.6 mm on the sides that hold the stone.');
  if (meta.petals) {
    const pt = meta.petals;
    if (pt.minThick < 0.5) add('fail', 'Petal edges too thin', `${f(pt.minThick)} mm at the tips.`, 'Petal thickness ≥ 0.8 mm (tips taper to ~0.5 mm).');
    else if (pt.minThick < 0.6) add('warn', 'Delicate petal tips', `${f(pt.minThick)} mm.`, 'Thicken petals to 0.9–1.0 mm for daily wear.');
    else add('pass', 'Petals', `${pt.count} petals in ${pt.layers} layer(s), ${f(pt.length)} × ${f(pt.width)} mm.`);
    if (pt.enamel && pt.enamel !== 'none') add('info', 'Enamel', `${pt.enamel} enamel on the petals: leave a 0.2–0.3 mm recess (champlevé) and fire after casting/polishing.`);
  }
  if (meta.manualEdits) add('info', 'Manual edits', `${meta.manualEdits} part(s) moved/arrayed/mirrored in Edit mode — re-check clearances visually; checks use parameter values.`);

  // ---- signet / text / relief / two-tone ----
  if (meta.signet) {
    const s = meta.signet;
    if (s.T < 0.8) add('fail', 'Signet plate too thin', `${f(s.T)} mm above the band.`, 'Use ≥ 1.2 mm so the face can be engraved and re-polished.');
    else add('pass', 'Signet plate', `${s.shape} ${f(s.W)} × ${f(s.L)} mm, ${f(s.T)} mm high.`);
    if (s.face !== 'plain' && meta.faceDepth > s.T - 0.5) add('fail', 'Face cut too deep', `${f(meta.faceDepth)} mm into a ${f(s.T)} mm plate.`, `Keep ≥ 0.5 mm under the engraving (max ${f(s.T - 0.5)} mm).`);
    if (meta.faceStroke !== undefined) {
      const minS = s.face.endsWith('engrave') ? 0.3 : 0.5;
      if (meta.faceStroke < minS) add('warn', 'Fine monogram strokes', `Thinnest stroke ≈ ${f(meta.faceStroke)} mm.`, 'Use a bolder font or bigger initials (engraved lines ≥ 0.3 mm, raised ≥ 0.5 mm).');
    }
    if (s.face.startsWith('image')) add('info', 'Signet image', 'Image relief comes from the Image → 3D tab; for seal-quality intaglio use 0.4–0.8 mm depth with clean, high-contrast artwork.');
  }
  if (meta.side) add('pass', 'Three-stone layout', `Side ${meta.side.cut} ${f(meta.side.L)} × ${f(meta.side.W)} mm at ±${f(meta.side.angleDeg, 1)}°, ${f(meta.side.gap)} mm clear of the centre head.`);
  if (meta.accentMode === 'full-eternity') add('warn', 'Full eternity cannot be resized', `${meta.accentCount} stones all around the band.`, 'Confirm the exact finger size before casting, or use half eternity.');
  else if (meta.accentMode === 'half-eternity') add('info', 'Half eternity', `${meta.accentCount} stones over the top half; the plain bottom can be resized ±1 size.`);
  if (meta.engrave) {
    const e = meta.engrave;
    if (e.tooLong) add('fail', 'Engraving too long', `"${e.text}" does not fit inside the band.`, 'Shorten the text or reduce the letter height.');
    else {
      if (e.size < 1.0) add('warn', 'Tiny engraving', `${f(e.size)} mm letters are hard to read.`, 'Use ≥ 1.2 mm for laser, ≥ 1.5 mm for cast engraving.');
      if (e.depth > Math.min(0.3, meta.minThickness * 0.2)) add('warn', 'Deep engraving', `${f(e.depth)} mm into a ${f(meta.minThickness)} mm shank.`, 'Keep 0.1–0.2 mm (or laser-engrave after casting).');
      else add('pass', 'Inside engraving', `"${e.text}" ${f(e.size)} mm high, ${f(e.depth)} mm deep, spans ${f(e.arcDeg, 0)}° of the inside.`);
    }
  }
  if (type === 'name') {
    if (!meta.fontReady) add('info', 'Font loading', 'The font is downloading — the design will rebuild automatically.');
    else {
      if (meta.groups > 1) add('fail', 'Letters are not connected', `${meta.groups} separate pieces — they would fall apart.`, 'Choose a connected script font, add an underline bar or a back plate, reduce letter spacing, or remove floating i/j dots.');
      else add('pass', 'One connected piece', `All letters touch the next one or the connector${meta.removedDots ? ` (${meta.removedDots} floating dot/accent removed)` : ''}.`);
      const need = meta.plateThickness ? 0.35 : metal.minWall + 0.1;            // letters on a back plate are supported
      if (meta.minStroke < need * 0.8 && !meta.plateThickness) add('fail', 'Strokes too thin', `Average thinnest stroke ≈ ${f(meta.minStroke)} mm.`, `Increase letter height or use a bolder font (strokes ≥ ${f(need)} mm).`);
      else if (meta.minStroke < need) add('warn', 'Delicate strokes', `≈ ${f(meta.minStroke)} mm.`, `≥ ${f(need)} mm is safer for daily wear.`);
      else add('pass', 'Stroke width', `≈ ${f(meta.minStroke)} mm minimum.`);
      if (meta.thickness < 0.9) add('warn', 'Thin name plate', `${f(meta.thickness)} mm bends easily.`, 'Use 1.0–1.4 mm for gold, 1.2–1.6 mm for silver.');
    }
  }
  if (type === 'relief') {
    if (!meta.hasImage) add('info', 'Demo motif', 'Upload a photo, logo or sketch in the Image → 3D tab to replace the demo rose.');
    if (meta.base < metal.minWall + 0.2) add('fail', 'Base too thin', `${f(meta.base)} mm under the relief.`, `Use ≥ ${f(metal.minWall + 0.4)} mm.`);
    else add('pass', 'Base thickness', `${f(meta.base)} mm base + ${f(meta.reliefDepth)} mm relief.`);
    if (meta.reliefDepth > 2.0) add('warn', 'Very deep relief', `${f(meta.reliefDepth)} mm.`, 'Deep undercuts trap investment; 0.4–1.2 mm reads well and polishes cleanly.');
    if (meta.cell < 0.06) add('info', 'Detail finer than casting', `Grid cell ${f(meta.cell, 3)} mm — features below ~0.2 mm will soften in casting and polishing.`);
  }
  if (params.headMetal && params.headMetal !== 'same' && params.headMetal !== params.metal) add('info', 'Two-tone', `${METALS[params.headMetal]?.label} head on a ${metal.label} body — cast separately and laser-weld/solder, or cast in one metal and rhodium-plate the head.`);
  if (params.finish === 'oxidized' && /^1[048]k|2[24]k|pt|pd/.test(metalKey)) add('warn', 'Oxidising precious white/yellow metals', 'Liver-of-sulphur blackening only works well on silver.', 'Use black rhodium plating for gold or platinum.');
  if (meta.pendingFont) add('info', 'Font loading', 'Text features appear once the font has downloaded.');

  // ---- weight target ----
  if (params.targetWeight > 0) {
    const d = (m.grams - params.targetWeight) / params.targetWeight;
    if (Math.abs(d) <= RULES.weightTolerance) add('pass', 'Weight target', `${f(m.grams)} g vs target ${f(params.targetWeight)} g (${d >= 0 ? '+' : ''}${f(d * 100, 1)}%).`);
    else add(Math.abs(d) > 0.15 ? 'fail' : 'warn', 'Weight off target', `${f(m.grams)} g vs target ${f(params.targetWeight)} g (${d >= 0 ? '+' : ''}${f(d * 100, 1)}%).`, 'Run “Optimize to target weight”.');
  }
  // ---- general casting ----
  add('info', 'Casting allowance', `Cast weight ≈ ${f(m.grams * 1.04)} g before finishing (~4% polishing loss). Wax/resin model ≈ ${f(m.volume / 1000, 2)} g.`);
  if (model.booleans?.length) add('pass', 'Boolean-safe geometry', `${model.booleans.length} boolean operations applied: ${[...new Set(model.booleans)].join(', ')}.`);

  const score = Math.max(0, 100 - out.filter((x) => x.level === 'fail').length * 20 - out.filter((x) => x.level === 'warn').length * 6);
  return { checks: out, score };
}
