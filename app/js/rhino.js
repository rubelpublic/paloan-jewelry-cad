// Rhino / Grasshopper export + human construction workflow (Rhino, MatrixGold, Grasshopper).
import { METALS, CUTS } from './data.js';

let lib = null;
export async function rhinoScript(type, params, extra = null) {
  if (!lib) {
    const r = await fetch('python/rhino/pjc_rhino_builder.py');
    if (!r.ok) throw new Error('Could not load the Rhino builder library');
    lib = await r.text();
  }
  const p = { type, ...params };
  delete p.style;
  if (extra && (extra.meshes?.length || extra.outlines?.length)) p.extra = extra;
  const json = JSON.stringify(p, null, 1);
  const header = `# Paloan Jewelry CAD Master — exported ${new Date().toISOString().slice(0, 10)}\n# Design: ${type}${params.style ? ' · ' + params.style : ''} · ${METALS[params.metal]?.label || params.metal}\nimport json as _json\nPARAMS = _json.loads(r'''${json}''')\n\n`;
  return header + lib.replace(/^# -\*- coding: utf-8 -\*-\n/, '');
}

const c = (s) => `<code>${s}</code>`;
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/** Step-by-step construction plan (returns [{title, steps[]}]). */
export function workflow(type, p, meta) {
  const W = [];
  const add = (title, steps) => W.push({ title, steps: steps.filter(Boolean) });
  add('Document setup', [
    `Units ${c('mm')}, absolute tolerance ${c('0.001')}, angle 0.1°. Template: Large Objects – Millimetres.`,
    `Layers: ${c('PJC::Metal::…')}, ${c('PJC::Stones')}, ${c('PJC::Cutters')} (hidden), ${c('Reference')} (locked). The exported script creates these automatically.`,
    'Place AI concept images with Picture on the Front/Top views at true scale (measure a known stone width) and lock them.',
  ]);
  if (type === 'ring') {
    add('Shank', [
      `Finger circle: ${c(`Circle`)} Ø ${f(meta.innerDiameter)} mm (US ${p.ringSize}) in the Front view, centred on the origin.`,
      p.shankStyle === 'twisted'
        ? `Twisted strands: two helix curves around the circle (${p.twist} twists), ${c('Pipe')} Ø ${f(meta.twistWire)} mm each, then ${c('BooleanUnion')}.`
        : `Draw the ${p.profile} cross-section (${f(p.widthTop)} × ${f(p.thickTop)} mm at top, ${f(p.widthBottom)} × ${f(p.thickBottom)} mm at bottom). Array 24–36 sections around the circle with taper, then ${c('Loft')} ${c('Closed=Yes')} (MatrixGold: Shank Builder with the same profile).`,
      p.shankStyle === 'split' || p.shankStyle === 'bypass' ? `${p.shankStyle === 'split' ? 'Split' : 'Bypass'}: build each half at ½ width and morph the upper third apart by ${f(p.splitGap)} mm (FlowAlongSrf or cage edit).` : '',
      p.texture !== 'none' ? `${p.texture} finish (${f(p.textureDepth)} mm deep): keep the NURBS shank clean, then apply MatrixGold Texture / ${c('Displace')} with a height map, or texture in ZBrush on a duplicate for print. Do not bake texture into the editable master.` : '',
      `Check: ${c('Check')}, ${c('ShowEdges')} → 0 naked edges; ${c('Volume')}.`,
    ]);
    if (p.headType !== 'none' && meta.stone) {
      const s = meta.stone;
      add('Stone & head', [
        `Gem: ${CUTS[s.cut]?.label} ${f(s.L)} × ${f(s.W)} mm (${f(s.carat)} ct ${s.gem}). MatrixGold ${c('Gem Studio')} or the exported faceted gem; girdle at Z = ${f(meta.girdleY)} mm (culet ${f(meta.culetToShank)} mm above the shank).`,
        p.headType === 'bezel'
          ? `Bezel: offset the girdle curve +${f(meta.bezelWall)} mm (wall) and −${f(meta.bezelLip)} mm (lip), ${c('ExtrudeCrv')} both, ${c('BooleanDifference')}, then subtract the gem cutter for the bearing.`
          : `${meta.prongCount} prongs Ø ${f(meta.prongDia)} mm: draw prong centre-lines from the gallery base to ${f(meta.topY * 0.62)} mm above the girdle, ${c('Pipe')} with radius ${f(meta.prongDia * 0.41)} → ${f(meta.prongDia / 2)} (MatrixGold ${c('Head Studio')}). Tips: ${p.prongStyle}.`,
        p.headType !== 'bezel' ? `Gallery: ${meta.rails || 0} rail(s) — scale the girdle curve 0.7–0.85, move below the girdle, ${c('Pipe')} Ø ${f(meta.prongDia * 0.72)} mm.` : '',
        p.headType === 'halo' ? `Halo: offset girdle by ${f(meta.haloOuter - p.haloStone / 2 - 0.3)} mm, ${c('ArrayCrv')} ${meta.haloCount} × ${f(p.haloStone)} mm melee (gap ${f(p.haloGap)} mm), shared beads Ø ${f(meta.beadDia)} mm, frame under the melee.` : '',
        `Seats: duplicate the gem, scale +0.06 mm, ${c('BooleanDifference')} it from prongs/bezel (bearing ≈ ${f(meta.seatOverlap)} mm). Keep the cutter on ${c('Cutters::Seat')}.`,
        p.cathedral ? `Cathedral: ${c('Pipe')} curves from the shoulders (±38°) up under the basket; blend with ${c('BlendSrf')} or MatrixGold Cathedral builder.` : '',
      ]);
    }
    const orn = [];
    if (p.spikes > 0) orn.push(`Spikes: ${meta.spikeCount} cones, base Ø ${f(p.spikeBase)} mm × ${f(p.spikeLen)} mm on surface normals (${c('Revolve')} profile / ${c('Cone')} + ${c('OrientOnSrf')}), sunk 0.25 mm into the shank, tips rounded 0.1 mm.`);
    if (p.openwork !== 'none') orn.push(`Openwork: ${p.openCount} ${p.openwork} windows (${f(meta.openHole)} mm, bridges ≥ ${f(meta.openBridge)} mm). Draw one window on a tangent plane, ${c('ExtrudeCrv')} radially, ${c('ArrayPolar')}, ${c('BooleanDifference')}.`);
    if (p.coils > 0) orn.push(`Coils: spiral curves on the surface (${c('Spiral')} + ${c('FlowAlongSrf')}), ${c('Pipe')} 0.84 → 0.56 mm.`);
    if (p.milgrain) orn.push(`Milgrain: ${c('ArrayCrv')} Ø 0.4 mm beads along both shank edges (MatrixGold Milgrain).`);
    if (p.accentCount > 0) orn.push(`Pavé: ${meta.accentCount} × ${f(p.accentSize)} mm on the shoulders, ${c('OrientOnSrf')}, beads Ø 0.6 mm, seats subtracted.`);
    if (orn.length) add('Ornament', orn);
    if (p.backHollow) add('Metal saving', [`Under-shank hollow: loft rectangular cutters along the inner bottom ${p.hollowSpan}° of the shank, ${f(p.hollowDepth)} mm deep with ${f(p.hollowRail)} mm rails; ${c('BooleanDifference')}. Leaves ${f(meta.hollowWall)} mm wall.`]);
  }
  if (type === 'pendant') {
    add('Body', [
      `Outline: ${p.shape} ${f(p.height)} × ${f(p.width)} mm in the Front view (${c('InterpCrv')} closed, or trace the AI image).`,
      `${c('ExtrudeCrv')} ${f(p.thickness)} mm ${c('Solid=Yes')}, ${c('FilletEdge')} ${f(p.bevel)} mm on the front edge.`,
      p.bail !== 'none' ? `Bail: ${c('Torus')} inner Ø ${f(p.bailInner)} mm, wire ${f(p.bailWire)} mm, axis along X so the chain runs left-right.` : '',
    ]);
    if (p.headType !== 'none' && meta.stone) add('Stone', [`${CUTS[meta.stone.cut]?.label} ${f(meta.stone.L)} × ${f(meta.stone.W)} mm, ${p.headType} setting, open-back light hole (girdle −0.6 mm).`]);
    if (p.openwork !== 'none') add('Openwork', [`${meta.openCount} ${p.openwork} holes Ø ${f(p.openSize)} mm, ${f(p.openBridge)} mm bridges, ${f(p.rim)} mm solid rim; array on a grid clipped to the inset outline, ${c('BooleanDifference')}.`]);
    if (p.backHollow) add('Metal saving', [`Back hollow: ${c('Offset')} the outline −${f(p.rim)} mm, extrude ${f(p.thickness - p.frontWall)} mm from the back, subtract → ${f(p.frontWall)} mm front wall.`]);
    if (p.spikes > 0) add('Ornament', [`${p.spikes} perimeter spikes Ø ${f(p.spikeBase)} × ${f(p.spikeLen)} mm, normals from ${c('Offset')} of the outline.`]);
  }
  if (type === 'earring') {
    if (p.earType === 'stud') add('Stud', ['Basket head as for rings (2 rails), base plate, then a 0.8 mm post. Use a wire post soldered after casting, not cast.', 'Check pair symmetry: build one, Mirror for the second if the design is handed.']);
    if (p.earType === 'hoop') add('Hoop', [`Profile ${f(p.hoopWidth)} × ${f(p.hoopThick)} mm swept around Ø ${f(p.hoopDia)} mm, 6° gap for the hinged post; hinge clearance ${f(p.hingeClearance)} mm.`]);
    if (p.earType === 'drop') add('Drop', ['Model the drop like a pendant; jump ring + shepherd hook from 0.8 mm wire (findings are usually bought, not cast).']);
  }
  if (type === 'bangle') add('Bangle', [`Oval rail ${f(p.innerW)} × ${f(p.innerH)} mm inner, ${p.profile} profile ${f(p.width)} × ${f(p.thickness)} mm, ${c('Sweep1')} or Loft of sections.`, p.cuffGap > 0 ? `Cuff opening ${f(p.cuffGap)} mm at the bottom; round the ends with ${c('FilletEdge')} 0.8 mm.` : '', p.hinge ? `Hinge: 3 knuckles, ${f(p.hingeClearance)} mm gaps, 1.0 mm pin; box clasp opposite.` : '']);
  if (type === 'chain') add('Chain', [`Link: stadium curve ${f(p.linkInnerL)} × ${f(p.linkInnerW)} mm inner, ${c('Pipe')} Ø ${f(p.wireDia)} mm. ${c('ArrayCrv')} ${meta.linkCount} links along the necklace curve, every 2nd rotated 90°.`, 'Most production chain is machine-made — model only custom links and connectors.']);
  if (type === 'ring' && p.shankStyle === 'signet') add('Signet', [
    `Plate: ${p.signetShape} ${f(p.signetW)} × ${f(p.signetL)} mm outline (Front = finger axis), ${c('ExtrudeCrv')} ${f(p.signetT + 1.2)} mm from 1.2 mm inside the band, ${c('FilletEdge')} 0.3–0.4 mm. Flare the shank shoulders into the plate with ${c('BlendSrf')} or MatrixGold Signet builder.`,
    p.signetFace.startsWith('initials') ? `Monogram “${p.signetText}”: ${c('TextObject')} (Output = Curves) → scale to the face → ${p.signetFace.endsWith('engrave') ? `${c('ExtrudeCrv')} ${f(p.faceDepth + 0.6)} mm and ${c('BooleanDifference')} ${f(p.faceDepth)} mm deep` : `${c('ExtrudeCrv')} ${f(p.faceDepth)} mm and ${c('BooleanUnion')}`}. The script imports the exact geometry as a mesh guide.` : '',
    p.signetFace.startsWith('image') ? `Image face: the exported mesh on ${c('PJC::…::Signet')} is the relief/engraving. For NURBS use MatrixGold Texture / ${c('Displace')} on the face with the same height map, or keep the mesh for printing.` : '',
  ]);
  if (type === 'ring' && p.sideStones === 'three-stone') add('Side stones', [`Two ${p.sideCut} side stones at ${f(p.sideRatio * 100, 0)}% of the centre width, ±${f(meta.side?.angleDeg, 1)}° around the band, ${p.sideHead} settings, ${f(meta.side?.gap)} mm clear of the centre head. Build one head, ${c('Mirror')} across the YZ plane.`]);
  if (type === 'ring' && p.accentMode && p.accentMode !== 'shoulders') add('Eternity', [`${meta.accentCount} × ${f(p.accentSize)} mm round melee in shared-bead settings around ${p.accentMode === 'full-eternity' ? 'the whole band (not resizable)' : 'the top half'}; ${c('ArrayCrv')} gems + bead seats along the band's top curve, ${c('BooleanDifference')} seat holes Ø ${f(p.accentSize * 0.7)} mm.`]);
  if (type === 'ring' && p.engraveText) add('Inside engraving', [`“${p.engraveText}” ${f(p.engraveSize)} mm high, ${f(p.engraveDepth)} mm deep: ${c('TextObject')} curves → ${c('FlowAlongSrf')} onto the inner surface → ${c('ExtrudeCrv')} → ${c('BooleanDifference')}. Usually laser-engraved after polishing instead.`]);
  if (type === 'relief') add('Image relief', [
    `Outline ${p.shape} ${f(meta.width)} × ${f(meta.height)} mm, base ${f(p.base)} mm, relief ${f(p.depth)} mm (${p.mode}).`,
    `Rhino: the script imports the relief as a closed mesh on ${c('PJC::Metal::Body::Relief')}. For NURBS: ${c('ExtrudeCrv')} the outline as the base and apply MatrixGold Texture / ${c('Displace')} with the same grayscale image; or keep the mesh — reliefs are printed as meshes anyway.`,
    'Casting: relief ≤ 1.2 mm reads best; avoid undercuts; polish highs, leave recesses satin for contrast.',
  ]);
  if (type === 'name') add('Name piece', [
    `Text “${p.text}” ${f(p.letterHeight)} mm, ${f(p.thickness)} mm thick${p.bar !== 'none' ? `, ${p.bar}` : ''}. Rhino: ${c('TextObject')} (Output = Curves, same font) or use the exported outlines → ${c('ExtrudeCrv')} ${f(p.thickness)} mm → ${c('BooleanUnion')} letters + connector → ${c('FilletEdge')} 0.1 mm.`,
    p.bail === 'ends' ? `Chain loops: ${c('Torus')} Ø ${f(p.bailInner)} mm inner at both ends, in the plane of the text.` : '',
  ]);
  if (p.headType === 'collet') add('Collet (one-layer)', [`Profile: wall ${f(p.bezelWall)} mm, taper ${f(p.colletTaper)} mm, chamfers ${f(p.chamferA)} / ${f(p.chamferB)} mm, height ${p.colletHeight ? f(p.colletHeight) + ' mm' : 'to the shank'}. ${c('Sweep1')} the profile around the girdle curve (JFR One-layer Collet / MatrixGold Bezel), subtract the gem cutter.`]);
  if (p.headType === 'flush') add('Flush setting', [`Offset the girdle +${f(p.flushMargin)} mm, ${c('ExtrudeCrv')} a solid button, ${c('BooleanDifference')} the gem so the table sits just proud; the setter hammers the metal over the girdle.`]);
  if (p.petals > 0) add('Flower petals', [
    `Draw half a petal outline (${f(p.petalLength)} × ${f(p.petalWidth)} mm, ${p.petalTip} tip) and ${c('Mirror')} it (JFR Horizontal/Vertical Mirror Curve).`,
    `Draw the cross-section (cupped, ${f(p.petalThick)} mm thick, ${f(p.petalRidge)} mm centre vein) and ${c('Sweep2')} along the two outline rails (Dual Rail).`,
    `Lift ${f(p.petalLift, 0)}°, curl the tip with ${c('Bend')} / gumball, then ${c('ArrayPolar')} ${p.petals} copies around the stone axis; ${p.petalLayers > 1 ? `add ${p.petalLayers - 1} more layer(s), shorter and more lifted, rotated half a step.` : ''}`,
    p.petalEnamel !== 'none' ? `Enamel: recess the petal tops 0.2–0.3 mm for ${p.petalEnamel} enamel.` : '',
  ]);
  if (p.edits && Object.keys(p.edits).length) add('Manual edits', Object.entries(p.edits).map(([name, e]) => `${name}: ${e.hidden ? 'deleted' : [e.m ? 'transformed (gumball)' : '', e.array > 1 ? `${c('ArrayPolar')} × ${e.array}` : '', e.mirror ? `${c('Mirror')} across YZ` : ''].filter(Boolean).join(', ')}`));
  if (p.headMetal && p.headMetal !== 'same') add('Two-tone', [`Head/settings in ${METALS[p.headMetal]?.label}: keep head parts on their own layer, cast separately and laser-weld, or cast one metal and rhodium/gold-plate selectively.`]);
  add('Production', [
    `Metal: ${METALS[p.metal]?.label}; expected finished weight shown on the right (+4% for cast sprue/polish loss).`,
    `Export STL at ${c('0.005 mm')} chord tolerance for resin printing; keep the .3dm with separate polysurfaces as the editable master.`,
    'Orient for printing with seats and prongs facing up; support from the inside of the shank/back.',
  ]);
  return W;
}

export function workflowHtml(W) {
  return W.map((s) => `<h4>${s.title}</h4><ol>${s.steps.map((x) => `<li>${x}</li>`).join('')}</ol>`).join('');
}
export function workflowMd(W) {
  return W.map((s) => `### ${s.title}\n${s.steps.map((x, i) => `${i + 1}. ${x.replace(/<\/?code>/g, '`')}`).join('\n')}`).join('\n\n');
}
