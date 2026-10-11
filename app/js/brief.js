// Offline design-brief parser: plain-language request -> jewelry type + parameters.
// Works without any API key; the AI mode refines the same structure.
import { STYLE_PRESETS } from './presets.js';

const num = (s) => parseFloat(String(s).replace(',', '.'));

export function parseBrief(text) {
  const t = ' ' + text.toLowerCase().replace(/[–—]/g, '-') + ' ';
  const notes = [];
  const p = {};
  let type = 'ring';
  if (/\b(pendant|charm|locket|medallion|necklace pendant)\b/.test(t)) type = 'pendant';
  else if (/\b(earring|stud|hoop|ear ?wire|drop earring|huggie)s?\b/.test(t)) type = 'earring';
  else if (/\b(bangle|cuff|bracelet)\b/.test(t) && !/\bchain\b/.test(t)) type = 'bangle';
  else if (/\b(chain|necklace)\b/.test(t)) type = 'chain';
  else if (/\b(ring|band|solitaire|engagement|wedding)\b/.test(t)) type = 'ring';

  // style
  const styles = [['gothic', /gothic|spik|dark|cathedral spire|lancet/], ['hammered', /hammer|beaten|forged/], ['organic', /organic|vine|flowing|nature|leaf|branch|wave/],
    ['luxury', /luxury|high jewel|haute|halo|pav[eé]/], ['artdeco', /art ?deco|deco\b|gatsby/], ['vintage', /vintage|victorian|edwardian|antique|filigree/],
    ['floral', /flor|flower|petal|blossom/], ['sculptural', /sculpt|twist|braid|rope/], ['architectural', /architect|geometric|structural/],
    ['minimal', /minimal|simple|dainty|delicate|thin/], ['tribal', /tribal|ethnic|bold geometric/], ['contemporary', /contemporary|modern|sleek|knife/]];
  for (const [s, re] of styles) if (re.test(t)) { p.style = s; break; }
  if (p.style && STYLE_PRESETS[type]?.[p.style]) Object.assign(p, STYLE_PRESETS[type][p.style]);

  // metal
  const metals = [['pt950', /platinum|pt ?950/], ['pd950', /palladium/], ['ag925', /silver|925|sterling/], ['brass', /brass/], ['24k', /24 ?k/], ['22k', /22 ?k/],
    ['18kw', /18 ?k[a-z]* white|white gold 18|18k ?wg/], ['18kr', /18 ?k[a-z]* rose|rose gold 18/], ['18ky', /18 ?k/], ['14kw', /14 ?k[a-z]* white|white gold/], ['14kr', /14 ?k[a-z]* rose|rose gold/], ['14ky', /14 ?k|yellow gold|gold/], ['10ky', /10 ?k/]];
  for (const [m, re] of metals) if (re.test(t)) { p.metal = m; break; }

  // stone
  const cuts = ['round', 'oval', 'cushion', 'princess', 'emerald cut', 'asscher', 'radiant', 'pear', 'marquise', 'heart', 'trillion'];
  for (const c of cuts) if (t.includes(c)) { p.cut = c === 'emerald cut' ? 'emerald' : c; if (type !== 'chain' && type !== 'bangle') p.headType = p.headType && p.headType !== 'none' ? p.headType : 'prong'; break; }
  if (/teardrop stone|pear[- ]shaped/.test(t)) p.cut = 'pear';
  const gems = [['labdiamond', /lab[- ]?(grown )?diamond/], ['moissanite', /moissanite/], ['sapphire', /sapphire/], ['ruby', /ruby/], ['emerald', /\bemerald(?! cut)/], ['amethyst', /amethyst/], ['tourmaline', /tourmaline/], ['onyx', /onyx/], ['cz', /\bcz\b|cubic zirconia/], ['diamond', /diamond/]];
  for (const [g, re] of gems) if (re.test(t)) { p.gem = g; if (type !== 'chain' && type !== 'bangle' && (!p.headType || p.headType === 'none')) p.headType = 'prong'; break; }
  let m;
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:ct|carat|cts)\b/))) { p.carat = num(m[1]); p.sizeMode = 'carat'; if (!p.headType || p.headType === 'none') p.headType = 'prong'; }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*mm\s*(?:stone|oval|pear|marquise|emerald|cushion|center|centre|gem)?/))) {
    const a = num(m[1]), b = num(m[2]);
    if (a < 25 && b < 25 && /stone|oval|pear|marquise|emerald|cushion|center|centre|gem|ct/.test(t)) { p.stoneL = Math.max(a, b); p.stoneW = Math.min(a, b); p.sizeMode = 'mm'; }
  }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:round|stone|center|centre|gem|diamond)/))) { p.stoneL = p.stoneW = num(m[1]); p.sizeMode = 'mm'; }
  if (/\bbezel\b/.test(t)) p.headType = 'bezel';
  if (/\bhalo\b/.test(t)) p.headType = 'halo';
  if ((m = t.match(/(\d)\s*[- ]?(?:prong|claw)/))) { p.prongCount = +m[1]; }
  else if (/six[- ]prong|6-claw/.test(t)) p.prongCount = 6;
  else if (/four[- ]prong/.test(t)) p.prongCount = 4;
  if (/claw/.test(t)) p.prongStyle = 'claw';
  if (/no stone|plain|without stone/.test(t)) p.headType = 'none';

  // geometry
  if ((m = t.match(/(?:ring )?size\s*(?:us)?\s*(\d+(?:[.,]\d+)?)/))) { const v = num(m[1]); if (type === 'ring' && v >= 2 && v <= 16) p.ringSize = v; }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:wide|width|band)|width\s*(?:of)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*mm/))) {
    const v = num(m[1] || m[2]);
    if (type === 'ring') { p.widthTop = v; p.widthBottom = Math.max(1.6, v * 0.9); } else if (type === 'bangle') p.width = v; else if (type === 'earring') p.hoopWidth = v; else if (type === 'pendant') p.width = v;
  }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:thick|thickness)|thickness\s*:?\s*(\d+(?:[.,]\d+)?)\s*mm/))) {
    const v = num(m[1] || m[2]);
    if (type === 'ring') { p.thickTop = v; p.thickBottom = v; } else if (type === 'pendant') p.thickness = v; else if (type === 'bangle') p.thickness = v; else if (type === 'earring') p.hoopThick = v;
  }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:tall|high|height|long|length)|height\s*:?\s*(\d+(?:[.,]\d+)?)\s*mm/))) {
    const v = num(m[1] || m[2]);
    if (type === 'pendant') p.height = v; else if (type === 'earring') p.dropHeight = v;
  }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|grams)\b(?!old)/))) { p.targetWeight = num(m[1]); notes.push(`Target weight ${p.targetWeight} g — press “Optimize to target weight” after generating.`); }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*cm\b/)) && type === 'chain') p.lengthCm = num(m[1]);
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:inch|in\b|")/)) && type === 'chain') p.lengthCm = num(m[1]) * 2.54;
  if (type === 'earring') {
    if (/hoop|huggie/.test(t)) p.earType = 'hoop'; else if (/drop|dangle|ear ?wire|hook/.test(t)) p.earType = 'drop'; else p.earType = 'stud';
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*hoop/))) p.hoopDia = num(m[1]);
  }
  if (type === 'pendant') {
    for (const s of ['circle', 'oval', 'teardrop', 'heart', 'cushion', 'hexagon', 'shield', 'star', 'crescent', 'moon', 'cross']) if (t.includes(s)) { p.shape = s === 'moon' ? 'crescent' : s === 'cross' ? (/gothic/.test(t) ? 'gothic-cross' : 'cross') : s; break; }
    if (/coin|round pendant|disc/.test(t)) p.shape = 'circle';
  }

  // features
  if (/split[- ]shank/.test(t)) p.shankStyle = 'split';
  if (/bypass/.test(t)) p.shankStyle = 'bypass';
  if (/twist|braid|rope/.test(t)) p.shankStyle = 'twisted';
  if (/cathedral/.test(t)) p.cathedral = true;
  if (/milgrain|millgrain|beaded edge/.test(t)) p.milgrain = true;
  if (/pav[eé]|accent|side stones|shoulder stones/.test(t)) { p.accentCount = p.accentCount || 6; }
  if (/hammer|beaten/.test(t)) { if (type === 'ring' || type === 'bangle' || type === 'earring') p.texture = 'hammered'; }
  if (/spike|spiky|thorn/.test(t)) p.spikes = p.spikes || (type === 'bangle' ? 20 : type === 'pendant' ? 16 : 14);
  if (/no spike/.test(t)) p.spikes = 0;
  if (/openwork|cut ?out|pierced|filigree|lattice|negative space/.test(t)) {
    p.openwork = /circle|dot/.test(t) ? 'circle' : /honeycomb|hex/.test(t) ? 'hex' : /diamond|lattice/.test(t) ? 'diamond' : /quatrefoil|filigree/.test(t) ? 'quatrefoil' : 'arch';
    if (type === 'ring' && (p.widthTop || 2.4) < 4.5) { p.widthTop = 5.5; p.widthBottom = 4.8; notes.push('Widened the band to 5.5 mm so openwork windows keep ≥ 0.8 mm bridges.'); }
    if (type === 'pendant' && p.openwork === 'hex') p.openwork = 'hex';
  }
  if (/coil|curl|spiral|swirl|tendril/.test(t)) p.coils = p.coils || 4;
  if (/hollow|lightweight|light weight|save gold|reduce weight|less gold|light/.test(t)) { p.backHollow = true; notes.push('Back hollowing enabled to save metal.'); }
  if (/hinge/.test(t)) p.hinge = true;
  if (/cuff|open bangle/.test(t)) p.cuffGap = p.cuffGap || 25;
  if (/knife[- ]edge/.test(t)) p.profile = 'knife';
  if (/comfort[- ]fit/.test(t)) p.profile = 'comfort';
  if (/flat (band|profile)/.test(t)) p.profile = 'flat';

  const summary = Object.entries(p).map(([k, v]) => `${k}=${v}`).join(', ');
  return { type, params: p, notes, summary };
}
