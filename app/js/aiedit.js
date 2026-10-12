// Natural-language edits for the current design ("6 prongs, longer petals, rose gold", "taller head", "new gothic pendant").
// Works offline; unknown requests fall back to Claude in main.js.
import { parseBrief } from './brief.js';
import { STYLE_PRESETS } from './presets.js';

const num = (s) => parseFloat(String(s).replace(',', '.'));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function parseEdit(text, type, current) {
  const t = ' ' + text.toLowerCase().replace(/[–—]/g, '-') + ' ';
  if (/^\s*(new|create|start|design|make me|make a new|build a new)\b/.test(t) && !/\b(it|this|the)\b/.test(t.slice(0, 18))) {
    return { newDesign: parseBrief(text) };
  }
  const p = {}, changes = [];
  const cur = (k) => (k in p ? p[k] : current[k]);
  const set = (k, v, label) => {
    if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return;
    const before = cur(k);
    if (before === v) return;
    p[k] = v;
    changes.push(`${label || k}: ${before === undefined || before === '' ? '—' : typeof before === 'number' ? round(before) : before} → ${typeof v === 'number' ? round(v) : v}`);
  };
  const scale = (k, f, lo, hi, label) => set(k, round(Math.min(hi, Math.max(lo, (cur(k) || 0) * f)), 3), label);
  const add = (k, d, lo, hi, label) => set(k, round(Math.min(hi, Math.max(lo, (cur(k) || 0) + d)), 3), label);
  let m;
  const more = /\b(more|bigger|larger|longer|taller|higher|wider|thicker|increase|add more)\b/;
  const less = /\b(less|fewer|smaller|shorter|lower|narrower|thinner|decrease|reduce)\b/;
  const said = (re) => re.test(t);

  // metal / finish / style
  const metals = [['pt950', /platinum/], ['ag925', /silver|sterling/], ['18kr', /rose gold/], ['18kw', /white gold/], ['18ky', /yellow gold|\bgold\b/]];
  for (const [k, re] of metals) if (re.test(t) && !/two[- ]tone|head in|setting in/.test(t)) { set('metal', k, 'metal'); break; }
  if ((m = t.match(/(platinum|white gold|yellow gold|rose gold)\s+(head|setting|prongs)|(head|setting|prongs) in (platinum|white gold|yellow gold|rose gold)|two[- ]tone/))) {
    const word = m[1] || m[4] || (cur('metal') === '18kw' ? 'yellow gold' : 'white gold');
    set('headMetal', { platinum: 'pt950', 'white gold': '18kw', 'yellow gold': '18ky', 'rose gold': '18kr' }[word] || '18kw', 'head metal');
  }
  for (const [k, re] of [['satin', /satin/], ['matte', /matte|sandblast/], ['brushed', /brushed/], ['oxidized', /oxidi[sz]|blacken/], ['polished', /polish(ed)?\b|shiny/]]) if (re.test(t)) { set('finish', k, 'finish'); break; }
  for (const st of Object.keys(STYLE_PRESETS[type] || {})) if (new RegExp(`\\b(make it |more |in )?${st === 'artdeco' ? 'art ?deco' : st}\\b`).test(t)) { Object.assign(p, STYLE_PRESETS[type][st]); set('style', st, 'style'); break; }

  // stone & setting
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:ct|carat)/))) { set('sizeMode', 'carat'); set('carat', num(m[1]), 'carat'); }
  if (said(/\b(bigger|larger) (stone|diamond|gem|centre|center)/)) { set('sizeMode', 'carat'); scale('carat', 1.3, 0.05, 6, 'carat'); }
  if (said(/\bsmaller (stone|diamond|gem|centre|center)/)) { set('sizeMode', 'carat'); scale('carat', 0.77, 0.05, 6, 'carat'); }
  for (const c of ['round', 'oval', 'cushion', 'princess', 'emerald cut', 'asscher', 'radiant', 'pear', 'marquise', 'heart', 'trillion']) {
    if (t.includes(c + ' ') && !t.includes(c + ' side') && !t.includes(c + ' petal') && !t.includes(c + ' tip') && !t.includes(c + ' bead')) { set('cut', c === 'emerald cut' ? 'emerald' : c, 'cut'); break; }
  }
  for (const [g, re] of [['sapphire', /sapphire/], ['ruby', /ruby/], ['emerald', /\bemerald\b(?! cut)/], ['moissanite', /moissanite/], ['labdiamond', /lab[- ]?(grown )?diamond/], ['amethyst', /amethyst/], ['cz', /\bcz\b|zirconia/]]) if (re.test(t)) { set('gem', g, 'gem'); break; }
  const settings = [['double-prong', /double (prong|claw)/], ['half-bezel', /half[- ]bezel/], ['collet', /collet|cone setting/], ['flush', /flush|gypsy/], ['halo', /\bhalo\b/], ['bezel', /\bbezel\b/], ['prong', /prong setting|claw setting|use prongs/], ['none', /no stone|remove (the )?stone/]];
  for (const [k, re] of settings) if (re.test(t) && !/remove (the )?halo|no halo/.test(t)) { set('headType', k, 'setting'); break; }
  if (said(/remove (the )?halo|no halo/)) set('headType', 'prong', 'setting');
  if ((m = t.match(/(\d+)\s*(?:prongs?|claws?)/))) set('prongCount', Math.max(2, Math.min(8, +m[1])), 'prongs');
  else if (said(/more (prongs|claws)/)) add('prongCount', 2, 2, 8, 'prongs');
  else if (said(/(fewer|less) (prongs|claws)/)) add('prongCount', -2, 2, 8, 'prongs');
  if (said(/claw (tips|prongs)|eagle claw/)) set('prongStyle', 'claw', 'prong tip');
  if (said(/pointed (tips|prongs)/)) set('prongStyle', 'pointed', 'prong tip');
  if (said(/round (bead|tips)/)) set('prongStyle', 'round', 'prong tip');
  if (said(/(taller|higher|longer) prongs/)) add('prongHeight', 0.15, 0.6, 1.8, 'prong height');
  if (said(/(shorter|lower) prongs/)) add('prongHeight', -0.15, 0.6, 1.8, 'prong height');
  if (said(/(thicker|heavier|stronger) prongs/)) set('prongDia', round(Math.max(cur('prongDia') || 0.9, 0.6) + 0.1), 'prong Ø');
  if (said(/(thinner|finer|delicate) prongs/)) set('prongDia', round(Math.max(0.6, (cur('prongDia') || 0.9) - 0.1)), 'prong Ø');
  if (said(/(bigger|larger) (beads|tips)/)) add('prongTip', 0.15, 0.7, 1.6, 'bead size');
  if ((m = t.match(/rotate (?:the )?(?:prongs|petals|head)\s*(?:by\s*)?(\d+)/))) set('prongRotate', +m[1] % 91, 'rotation');
  if (said(/(taller|higher) (head|setting|profile)|raise the (stone|head)/)) add('galleryLift', 0.5, 0.2, 4, 'gallery lift');
  if (said(/(lower|shorter) (head|setting|profile)|low[- ]profile|lower the (stone|head)/)) add('galleryLift', -0.4, 0.2, 4, 'gallery lift');
  if (said(/(thicker|wider) (bezel|collet|wall)/)) add('bezelWall', 0.15, 0.4, 2, 'wall');
  if (said(/(thinner) (bezel|collet|wall)/)) add('bezelWall', -0.15, 0.4, 2, 'wall');
  if (said(/more taper|(taper|cone) more/)) add('colletTaper', 0.3, 0, 3, 'collet taper');

  // petals / flower
  if ((m = t.match(/(\d+)\s*petals?/))) set('petals', Math.min(16, +m[1]), 'petals');
  else if (said(/add (a )?(flower|petals|lotus|leaves)|flower (head|crown)|make it a flower/)) { set('petals', cur('petals') || 8, 'petals'); }
  if (said(/remove (the )?(petals|flower|leaves)|no petals/)) set('petals', 0, 'petals');
  if (said(/(longer|bigger|larger) (petals|leaves)/)) scale('petalLength', 1.2, 2, 16, 'petal length');
  if (said(/(shorter|smaller) (petals|leaves)/)) scale('petalLength', 0.82, 2, 16, 'petal length');
  if (said(/(wider|fatter) (petals|leaves)/)) scale('petalWidth', 1.2, 1, 8, 'petal width');
  if (said(/(narrower|thinner|slimmer) (petals|leaves)/)) scale('petalWidth', 0.82, 1, 8, 'petal width');
  if (said(/more (layers|petal layers)|another layer/)) add('petalLayers', 1, 1, 3, 'petal layers');
  if (said(/(fewer|less) layers|one layer|single layer/)) set('petalLayers', 1, 'petal layers');
  if (said(/(flatter|open) (petals|flower)/)) add('petalLift', -10, -20, 70, 'petal lift');
  if (said(/(cupped|closed|tulip|more lift)/)) add('petalLift', 12, -20, 70, 'petal lift');
  if (said(/more curl|curl (the )?(tips|petals)/)) add('petalCurl', 0.4, -1, 2, 'petal curl');
  if (said(/round petals/)) set('petalTip', 'round', 'petal tip');
  if (said(/pointed (petals|leaves)/)) set('petalTip', 'pointed', 'petal tip');
  for (const c of ['green', 'pink', 'blue', 'white', 'black', 'red']) if (t.includes(c + ' enamel')) { set('petalEnamel', c, 'enamel'); break; }
  if (said(/no enamel|remove (the )?enamel/)) set('petalEnamel', 'none', 'enamel');

  // band / body
  if ((m = t.match(/(?:ring )?size\s*(?:us\s*)?(\d+(?:[.,]\d+)?)/)) && type === 'ring') set('ringSize', num(m[1]), 'ring size');
  const bandWord = /(band|shank|ring)/;
  if (said(/(thicker|heavier) (band|shank|ring)/) || (type !== 'ring' && said(/\bthicker\b/))) {
    if (type === 'ring') { scale('thickTop', 1.15, 0.8, 5, 'thickness top'); scale('thickBottom', 1.15, 0.8, 5, 'thickness bottom'); }
    else if ('thickness' in current) scale('thickness', 1.15, 0.5, 6, 'thickness');
  }
  if (said(/(thinner|lighter|slimmer) (band|shank|ring)/) || (type !== 'ring' && said(/\bthinner\b/))) {
    if (type === 'ring') { scale('thickTop', 0.88, 0.8, 5, 'thickness top'); scale('thickBottom', 0.88, 1.0, 5, 'thickness bottom'); }
    else if ('thickness' in current) scale('thickness', 0.88, 0.5, 6, 'thickness');
  }
  if (said(/(wider|broader) (band|shank)/)) { scale('widthTop', 1.2, 1.2, 14, 'width top'); scale('widthBottom', 1.2, 1.2, 14, 'width bottom'); }
  if (said(/(narrower|thinner) (band|shank)|dainty band/)) { scale('widthTop', 0.85, 1.6, 14, 'width top'); scale('widthBottom', 0.85, 1.6, 14, 'width bottom'); }
  void bandWord;
  for (const [k, re] of [['split', /split shank/], ['twisted', /twist(ed)? (band|shank)|rope band/], ['bypass', /bypass/], ['signet', /signet/], ['classic', /(plain|classic) (band|shank)/]]) if (re.test(t)) { set('shankStyle', k, 'shank'); break; }
  if (type !== 'ring' && said(/\b(bigger|larger)\b/) && !said(/stone|petal|bead|bail/)) { for (const k of ['height', 'width', 'dropHeight', 'dropWidth', 'hoopDia', 'letterHeight']) if (k in current) scale(k, 1.15, 1, 90, k); }
  if (type !== 'ring' && said(/\b(smaller)\b/) && !said(/stone|petal|bead|bail/)) { for (const k of ['height', 'width', 'dropHeight', 'dropWidth', 'hoopDia', 'letterHeight']) if (k in current) scale(k, 0.87, 1, 90, k); }
  for (const s of ['circle', 'oval', 'teardrop', 'heart', 'cushion', 'hexagon', 'shield', 'star', 'crescent']) if (type === 'pendant' && t.includes(' ' + s)) { set('shape', s, 'shape'); break; }

  // ornaments on / off
  const toggles = [
    ['spikes', /add spikes|with spikes|spiky/, /remove (the )?spikes|no spikes/, 14, 0],
    ['milgrain', /add milgrain|milgrain edge/, /remove milgrain|no milgrain/, true, false],
    ['cathedral', /cathedral/, /no cathedral|remove cathedral/, true, false],
    ['coils', /add (coils|curls|vines)/, /remove (coils|curls|vines)/, 4, 0],
    ['backHollow', /lighter|less gold|less metal|reduce weight|hollow/, /solid back|no hollow/, true, false],
  ];
  for (const [k, on, off, vOn, vOff] of toggles) { if (off.test(t)) set(k, vOff, k); else if (on.test(t) && k in current) set(k, vOn, k); }
  if (said(/more spikes/)) add('spikes', 6, 0, 40, 'spikes');
  if (said(/(fewer|less) spikes/)) add('spikes', -6, 0, 40, 'spikes');
  if (said(/add (pav[eé]|accents|side diamonds|shoulder stones)/)) { set('accentMode', 'shoulders'); set('accentCount', cur('accentCount') || 6, 'pavé per side'); }
  if (said(/full eternity/)) set('accentMode', 'full-eternity', 'stones along band');
  else if (said(/eternity/)) set('accentMode', 'half-eternity', 'stones along band');
  if (said(/three[- ]stone|side stones|trilogy/)) set('sideStones', 'three-stone', 'side stones');
  if (said(/remove (the )?side stones|single stone|solitaire/)) set('sideStones', 'none', 'side stones');
  if (said(/add openwork|pierce|cut[- ]?outs?/)) set('openwork', type === 'ring' ? 'arch' : 'circle', 'openwork');
  if (said(/remove openwork|no openwork/)) set('openwork', 'none', 'openwork');
  if ((m = text.match(/engrav\w*\s+(?:it\s+)?(?:with\s+)?["“']([^"”']{1,30})["”']/i))) set('engraveText', m[1], 'engraving');
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|grams?)\b/))) set('targetWeight', num(m[1]), 'target weight');
  return { params: p, changes, understood: changes.length > 0 };
}
