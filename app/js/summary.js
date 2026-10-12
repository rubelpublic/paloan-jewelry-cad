// Design summary: one sheet with overview, dimensions, metal weights in all alloys, gem table, gem map and checks.
import { METALS, GEMS, CUTS, MODEL_MATERIALS, usToEu, usToUk } from './data.js';

const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function customAlloys() { try { return JSON.parse(localStorage.getItem('pjc.customAlloys') || '[]'); } catch { return []; } }
export function saveCustomAlloys(list) { try { localStorage.setItem('pjc.customAlloys', JSON.stringify(list)); } catch { /* ignore */ } }

export function summaryHTML({ type, params: p, model, m, v, inv, gemMap, shot }) {
  const meta = model.meta, metal = METALS[p.metal];
  const pair = m.pair ? 2 : 1;
  const gemsQty = inv.reduce((s, g) => s + g.qty, 0), gemsCt = inv.reduce((s, g) => s + g.qty * g.ctEach, 0);
  const prongs = (meta.prongCount || 0) * pair + (p.gems || []).reduce((s, g) => s + (g.prongs?.count || 0), 0) * pair;
  const cutters = (p.gems || []).filter((g) => g.cutter?.on !== false).length;
  const fails = v.checks.filter((c) => c.level === 'fail'), warns = v.checks.filter((c) => c.level === 'warn');
  const rows = (arr) => arr.map((r) => `<tr>${r.map((c, i) => `<${i ? 'td' : 'th'}>${c}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('');
  const overview = [
    ['Piece', `${esc(type)}${p.style ? ' · ' + esc(p.style) : ''}${p.earType ? ' · ' + esc(p.earType) : ''}`],
    ['Metal', `${esc(metal.label)}${p.headMetal && p.headMetal !== 'same' ? ` + ${esc(METALS[p.headMetal]?.label)} head` : ''} · ${esc(p.finish || 'polished')}`],
    ['Finished weight', `<b>${f(m.grams)} g</b>${m.pair ? ' (pair)' : ''} · cast ≈ ${f(m.grams * 1.04)} g`],
    ['Metal volume', `${f(m.volume, 1)} mm³ · surface ${f(m.area / 100, 1)} cm²`],
    ['Dimensions', `${f(m.bbox.x)} × ${f(m.bbox.y)} × ${f(m.bbox.z)} mm`],
    type === 'ring' ? ['Ring size', `US ${p.ringSize} · UK ${usToUk(p.ringSize)} · EU ${f(usToEu(p.ringSize), 1)} · Ø ${f(meta.innerDiameter)} mm`] : null,
    ['Gems', `<b>${gemsQty}</b> stones · <b>${f(gemsCt, 3)} ct</b> total`],
    ['Prongs / cutters', `${prongs} prongs · ${cutters} gem cutters · ${model.booleans?.length || 0} boolean operations`],
    ['Gem spacing', meta.gemGaps ? `closest gap ${meta.gemGaps.min == null ? '—' : f(meta.gemGaps.min, 3) + ' mm'} · ${meta.gemGaps.collisions} collision(s)` : '—'],
    ['Manufacturability', `<b>${v.score}/100</b> · ${fails.length} fail · ${warns.length} warning`],
  ].filter(Boolean);
  const gemRows = inv.map((g) => [esc(g.group), `${esc(CUTS[g.cut]?.label || g.cut)}`, g.L === g.W ? f(g.L) : `${f(g.L)} × ${f(g.W)}`, esc(GEMS[g.gem]?.label || g.gem), g.qty, f(g.ctEach, 3), f(g.ctEach * g.qty, 3), esc(g.setting || '')]);
  const alloys = [...Object.entries(METALS).map(([k, mt]) => [mt.label, mt.density, k === p.metal]), ...customAlloys().map((c) => [c.name + ' (custom)', c.density, false])]
    .map(([n, d, cur]) => `<tr class="${cur ? 'cur' : ''}"><td>${esc(n)}</td><td>${f(d, 2)}</td><td>${f((m.volume * d) / 1000 * pair)} g</td></tr>`).join('');
  const models = Object.entries(MODEL_MATERIALS).map(([n, d]) => `${n} ${f((m.volume * d) / 1000 * pair)} g`).join(' · ');
  const partRows = m.parts.map((pt) => [esc(pt.name), esc(pt.layer), pt.kind === 'metal' ? `${f(pt.volume, 1)} mm³ · ${f((pt.volume * (METALS[p.metal]?.density || 15.5)) / 1000)} g` : 'stone']);
  return `<div class="summary">
  <div class="sum-head"><div><h2>Design summary</h2><p class="muted">Paloan Jewelry CAD Master · ${new Date().toLocaleString()}</p></div>${shot ? `<img class="sum-shot" src="${shot}" alt="render">` : ''}</div>
  <table class="sum-kv">${rows(overview)}</table>
  <h3>Gems</h3>
  ${inv.length ? `<table class="sum-t"><tr><th>Group</th><th>Cut</th><th>Size mm</th><th>Material</th><th>Qty</th><th>ct each</th><th>ct total</th><th>Setting</th></tr>${gemRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}<tr class="tot"><td colspan="4">Total</td><td>${gemsQty}</td><td></td><td>${f(gemsCt, 3)}</td><td></td></tr></table>` : '<p class="muted">No gems.</p>'}
  ${gemMap ? `<h3>Colour-coded gem map</h3><img class="sum-map" src="${gemMap}" alt="gem map">` : ''}
  <h3>Metal weight in alloys</h3>
  <table class="sum-t"><tr><th>Alloy</th><th>g/cm³</th><th>Weight</th></tr>${alloys}</table>
  <p class="muted small">Models: ${models}</p>
  <h3>Components</h3>
  <table class="sum-t"><tr><th>Part</th><th>Layer</th><th>Volume / weight</th></tr>${partRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>
  <h3>Checks</h3>
  <ul class="sum-checks">${[...fails, ...warns].map((c) => `<li class="${c.level}"><b>${esc(c.title)}</b> — ${esc(c.detail)}${c.fix ? ` <i>Fix: ${esc(c.fix)}</i>` : ''}</li>`).join('') || '<li class="pass">All checks passed.</li>'}</ul>
</div>`;
}
