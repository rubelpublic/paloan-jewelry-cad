// Reference data: alloys, gemstones, ring sizes, manufacturing tolerances.
// All lengths are millimetres, densities g/cm3 (= mg/mm3).

export const METALS = {
  '24k':      { label: '24K Gold (999)',        density: 19.32, color: 0xf2c14e, rough: 0.18, minWall: 0.8, castMin: 0.6 },
  '22k':      { label: '22K Yellow Gold',       density: 17.80, color: 0xf0bf52, rough: 0.18, minWall: 0.8, castMin: 0.6 },
  '18ky':     { label: '18K Yellow Gold',       density: 15.50, color: 0xe8b84a, rough: 0.16, minWall: 0.6, castMin: 0.5 },
  '18kw':     { label: '18K White Gold',        density: 15.90, color: 0xdcdcd6, rough: 0.14, minWall: 0.6, castMin: 0.5 },
  '18kr':     { label: '18K Rose Gold',         density: 15.20, color: 0xe2a184, rough: 0.16, minWall: 0.6, castMin: 0.5 },
  '14ky':     { label: '14K Yellow Gold',       density: 13.10, color: 0xe6bb5c, rough: 0.17, minWall: 0.6, castMin: 0.5 },
  '14kw':     { label: '14K White Gold',        density: 12.60, color: 0xd8d8d2, rough: 0.15, minWall: 0.6, castMin: 0.5 },
  '14kr':     { label: '14K Rose Gold',         density: 13.00, color: 0xdf9f86, rough: 0.17, minWall: 0.6, castMin: 0.5 },
  '10ky':     { label: '10K Yellow Gold',       density: 11.60, color: 0xdcb565, rough: 0.18, minWall: 0.6, castMin: 0.5 },
  'pt950':    { label: 'Platinum 950',          density: 20.10, color: 0xd4d6d8, rough: 0.13, minWall: 0.5, castMin: 0.45 },
  'pd950':    { label: 'Palladium 950',         density: 12.00, color: 0xcfd0cf, rough: 0.14, minWall: 0.6, castMin: 0.5 },
  'ag925':    { label: 'Sterling Silver 925',   density: 10.36, color: 0xe4e4e4, rough: 0.12, minWall: 0.8, castMin: 0.7 },
  'brass':    { label: 'Brass (prototype)',     density: 8.50,  color: 0xc9a54a, rough: 0.25, minWall: 0.8, castMin: 0.7 },
};

// Wax / resin for casting trees and 3D printing quotes.
export const WAX_DENSITY = 1.0;

export const GEMS = {
  diamond:    { label: 'Diamond',          density: 3.52, ior: 2.42, color: 0xffffff, hardness: 10 },
  labdiamond: { label: 'Lab Diamond',      density: 3.52, ior: 2.42, color: 0xffffff, hardness: 10 },
  moissanite: { label: 'Moissanite',       density: 3.21, ior: 2.65, color: 0xfbfdf6, hardness: 9.25 },
  sapphire:   { label: 'Blue Sapphire',    density: 4.00, ior: 1.77, color: 0x1f4fd1, hardness: 9 },
  ruby:       { label: 'Ruby',             density: 4.00, ior: 1.77, color: 0xc0122f, hardness: 9 },
  emerald:    { label: 'Emerald',          density: 2.72, ior: 1.58, color: 0x13a05a, hardness: 7.75 },
  amethyst:   { label: 'Amethyst',         density: 2.65, ior: 1.55, color: 0x8a43c8, hardness: 7 },
  tourmaline: { label: 'Pink Tourmaline',  density: 3.06, ior: 1.62, color: 0xe86fa4, hardness: 7.25 },
  onyx:       { label: 'Black Onyx',       density: 2.65, ior: 1.54, color: 0x111111, hardness: 7 },
  cz:         { label: 'Cubic Zirconia',   density: 5.80, ior: 2.15, color: 0xffffff, hardness: 8.25 },
};

// Diamond reference: [length/width ratio, width in mm of a 1.00 ct stone, depth % of width, table %]
export const CUTS = {
  round:    { label: 'Round Brilliant', ratio: 1.00, w1: 6.40, depth: 0.615, table: 0.57, corners: false, points: 0 },
  oval:     { label: 'Oval',            ratio: 1.40, w1: 5.60, depth: 0.60,  table: 0.57, corners: false, points: 0 },
  cushion:  { label: 'Cushion',         ratio: 1.05, w1: 5.60, depth: 0.66,  table: 0.60, corners: true,  points: 0 },
  princess: { label: 'Princess',        ratio: 1.00, w1: 5.50, depth: 0.72,  table: 0.68, corners: true,  points: 0 },
  emerald:  { label: 'Emerald Cut',     ratio: 1.40, w1: 5.00, depth: 0.65,  table: 0.65, corners: true,  points: 0 },
  asscher:  { label: 'Asscher',         ratio: 1.00, w1: 5.50, depth: 0.66,  table: 0.62, corners: true,  points: 0 },
  radiant:  { label: 'Radiant',         ratio: 1.25, w1: 5.50, depth: 0.66,  table: 0.64, corners: true,  points: 0 },
  pear:     { label: 'Pear',            ratio: 1.55, w1: 5.50, depth: 0.60,  table: 0.56, corners: false, points: 1 },
  marquise: { label: 'Marquise',        ratio: 2.00, w1: 5.00, depth: 0.60,  table: 0.56, corners: false, points: 2 },
  heart:    { label: 'Heart',           ratio: 1.00, w1: 6.20, depth: 0.60,  table: 0.56, corners: false, points: 1 },
  trillion: { label: 'Trillion',        ratio: 1.00, w1: 6.80, depth: 0.45,  table: 0.60, corners: true,  points: 3 },
};

/** Stone dimensions (L along finger axis, W across) from carat weight. */
export function stoneDimsFromCarat(cut, carat, gem = 'diamond') {
  const c = CUTS[cut] || CUTS.round;
  const dens = (GEMS[gem] || GEMS.diamond).density;
  const k = Math.cbrt(Math.max(carat, 0.005) * GEMS.diamond.density / dens);
  const W = c.w1 * k;
  return { L: W * c.ratio, W, D: W * c.depth };
}

/** Approximate carat weight from mm dimensions (inverse of the above). */
export function caratFromDims(cut, L, W, gem = 'diamond') {
  const c = CUTS[cut] || CUTS.round;
  const dens = (GEMS[gem] || GEMS.diamond).density;
  const wEq = Math.sqrt((L * W) / c.ratio);
  return Math.pow(wEq / c.w1, 3) * dens / GEMS.diamond.density;
}

// Ring sizes. US numeric size -> inner diameter (mm).
export const usToDiameter = (us) => 11.63 + 0.8128 * us;
export const diameterToUs = (d) => (d - 11.63) / 0.8128;
export const usToEu = (us) => Math.PI * usToDiameter(us);              // EU size = circumference in mm
export const usToUk = (us) => {
  // UK A ≈ US 0.5 and every UK letter ≈ half a US size.
  const idx = Math.max(0, Math.min(25.5, (us - 0.5) * 2));
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(idx)];
  return letter + (idx - Math.floor(idx) >= 0.5 ? '½' : '');
};
export const usToIndia = (us) => Math.round(Math.PI * usToDiameter(us) - 40); // IN size ≈ circumference − 40

// Casting / setting tolerances used by the validator (gold baseline; per-metal tweaks applied in validate.js).
export const RULES = {
  ringShankMinFail: 1.0, ringShankMinWarn: 1.3, ringWidthMin: 1.5,
  prongDiaForStone: (w) => (w <= 3 ? 0.6 : w <= 5 ? 0.75 : w <= 7 ? 0.9 : w <= 9 ? 1.05 : 1.2),
  seatOverlapMin: 0.08, seatOverlapMax: 0.35,
  spikeBaseMin: 1.0, spikeRatioWarn: 2.5, spikeRatioFail: 3.6,
  bridgeWarn: 0.8, bridgeFail: 0.6, holeMin: 0.6,
  hollowWallMin: 0.6, hollowRailMin: 0.8,
  haloGapMin: 0.08, haloGapMax: 0.3, beadMin: 0.5,
  bezelWallMin: 0.5, bezelLipMin: 0.15, bezelLipMax: 0.6,
  chainWireMin: 0.6, hingeClearMin: 0.05, hingeClearMax: 0.2,
  postDiaMin: 0.76, postDiaMax: 0.95, postLenMin: 9, postLenMax: 12,
  bailInnerMin: 3.0, headHeightWarn: 8.5, fingerClearance: 0.4,
  weightTolerance: 0.05,
};

export const STYLE_NOTES = {
  classic:      'Balanced proportions, polished comfort-fit shank, conventional four or six prong head.',
  contemporary: 'Smooth tapering surfaces, minimal visible metal at the head, crisp knife or flat profiles.',
  luxury:       'High jewelry: halo or pavé, cathedral shoulders, milgrain, generous but hollowed metal.',
  gothic:       'Pointed spikes, sharp negative space (lancet arches), knife edges, darker proportions.',
  hammered:     'Controlled hammered dimples (beaten texture) on the outer surface, satin or high polish.',
  organic:      'Flowing waves, vine coils, asymmetric softness; avoid perfectly straight edges.',
  sculptural:   'Twisted, braided or lofted volume; the form is the ornament.',
  floral:       'Petal galleries, flower heads, scrolled shoulders and bead accents.',
  artdeco:      'Geometric stepping, emerald or asscher cuts, milgrain borders, symmetry.',
  vintage:      'Victorian/Edwardian: milgrain, filigree openwork, cathedral arches, bead settings.',
  architectural:'Cathedral arches, flat facets, visible structure, openwork windows.',
  minimal:      'Thin band, low profile, no ornament, precise proportions.',
  tribal:       'Bold geometric grooves, hammered or oxidised finish, heavy but hollowed.',
};
