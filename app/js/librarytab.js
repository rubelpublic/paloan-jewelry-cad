// 📚 Library tab — asset manager UI: browse / search / use / insert / rename / delete / export / import components.
import { CATEGORIES, listAssets, saveAsset, deleteAsset, renameAsset, exportLibrary, importLibrary, packGeometries, gemDefaultsFrom, warmPartCache, cachePart } from './assets.js';
import { CUTS } from './data.js';

export function initLibraryTab(api) {
  const $ = (s) => document.querySelector(s);
  let cat = 'all', q = '';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('#libCats').innerHTML = [['all', 'All'], ...Object.entries(CATEGORIES)].map(([k, l]) => `<button data-cat="${k}" class="${k === 'all' ? 'on' : ''}">${l.split(' (')[0]}</button>`).join('');
  $('#libCats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; document.querySelectorAll('#libCats button').forEach((x) => x.classList.toggle('on', x === b)); render(); };
  $('#libSearch').oninput = (e) => { q = e.target.value.toLowerCase(); render(); };

  const icon = { gem: '💎', prong: '⋔', cutter: '⌀', setting: '◈', design: '💍', part: '▣' };
  function desc(a) {
    const d = a.data || {};
    if (a.category === 'gem') return `${CUTS[d.cut]?.label || d.cut} ${d.L}×${d.W} mm · ${d.gem}`;
    if (a.category === 'prong') return d.count ? `${d.count} × Ø${d.dia} mm, ${d.tip}` : 'no prongs';
    if (a.category === 'cutter') return `tol ${d.tol} · ${d.hole ? `hole ${Math.round(d.holeRatio * 100)}%` : 'blind'}`;
    if (a.category === 'setting') return `${d.gem?.cut} ${d.gem?.L} mm · ${d.prongs?.count || 0} prongs`;
    if (a.category === 'design') return `${d.type}${d.params?.style ? ' · ' + d.params.style : ''}`;
    if (a.category === 'part') return `${d.pieces?.length || 0} piece(s) · ${d.kind || 'metal'}`;
    return '';
  }
  async function render() {
    const all = await listAssets();
    const list = all.filter((a) => (cat === 'all' || a.category === cat) && (!q || (a.name + ' ' + desc(a)).toLowerCase().includes(q)));
    $('#libCount').textContent = `${list.length} of ${all.length} assets`;
    $('#libGrid').innerHTML = list.map((a) => `<div class="asset" data-id="${esc(a.id)}">
      <div class="thumb">${a.thumb ? `<img src="${a.thumb}" alt="">` : `<span>${icon[a.category] || '•'}</span>`}</div>
      <div class="meta"><b title="${esc(a.name)}">${esc(a.name)}</b><span class="muted small">${esc(CATEGORIES[a.category]?.split(' (')[0])} · ${esc(desc(a))}${a.builtin ? ' · built-in' : ''}</span></div>
      <div class="acts"><button data-act="use" class="primary">${a.category === 'design' ? 'Open' : a.category === 'part' ? 'Insert' : 'Use'}</button>${a.builtin ? '' : '<button data-act="ren" title="Rename">✎</button><button data-act="del" title="Delete">×</button>'}</div></div>`).join('') || '<p class="muted">No assets here yet — save some with the buttons above.</p>';
    document.querySelectorAll('#libGrid .asset').forEach((el) => {
      const a = list.find((x) => x.id === el.dataset.id);
      el.querySelector('[data-act=use]').onclick = () => use(a);
      el.querySelector('[data-act=del]')?.addEventListener('click', async () => { if (confirm(`Delete “${a.name}”?`)) { await deleteAsset(a.id); render(); } });
      el.querySelector('[data-act=ren]')?.addEventListener('click', async () => { const n = prompt('New name', a.name); if (n) { await renameAsset(a.id, n); render(); } });
    });
  }
  function use(a) {
    if (a.category === 'design') { api.openDesign(a.data.type, a.data.params); api.toast(`Opened “${a.name}”`); return; }
    if (a.category === 'part') {
      const inserts = [...(api.getParams().inserts || []), { id: a.id, name: a.name }];
      api.commit({ inserts }, `Inserted “${a.name}” — use ✥ Edit to move it into place`);
      return;
    }
    api.useGemPreset(gemDefaultsFrom(a));
    api.setTab('gems');
    api.toast(`“${a.name}” loaded into Gem tools — click ● Place gems.`);
  }
  // save buttons
  $('#libSaveDesign').onclick = async () => {
    const { type, params } = api.getState();
    const name = prompt('Name this design', `${type} ${params.style || ''} ${new Date().toLocaleDateString()}`.trim()); if (!name) return;
    const p = { ...params }; delete p.customOutline;
    await saveAsset({ category: 'design', name, thumb: api.thumb(), data: { type, params: p } });
    api.toast('Design saved to the library'); render();
  };
  $('#libSavePart').onclick = async () => {
    const part = api.selectedPart();
    if (!part) return api.toast('Turn on ✥ Edit and click a part first (e.g. a petal, a head, a motif).');
    const name = prompt('Name this component', part.name.replace(/\s*\(\d+\)$/, '')); if (!name) return;
    const asset = await saveAsset({ category: 'part', name, thumb: api.thumb(), data: { kind: part.kind, gem: part.gem, pieces: packGeometries(part.pieces) } });
    cachePart(asset);
    api.toast(`Component “${name}” saved — insert it into any design from the library.`); render();
  };
  $('#libSaveGem').onclick = async () => {
    const c = api.gemCurrent();
    const name = prompt('Name this gem setting', `${c.cut} ${c.L} mm · ${c.prongs.count} prongs`); if (!name) return;
    await saveAsset({ category: 'setting', name, data: { gem: { cut: c.cut, L: c.L, W: c.W, gem: c.gem, depth: c.depth }, prongs: c.prongs, cutter: c.cutter } });
    api.toast('Gem setting saved'); render();
  };
  $('#libExport').onclick = async () => {
    const blob = new Blob([await exportLibrary()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'paloan-library.json' });
    document.body.appendChild(a); a.click(); a.remove();
  };
  $('#libImport').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await importLibrary(await f.text()); await warmPartCache(); api.toast(`Imported ${n} asset(s)`); render(); } catch (err) { api.toast('Import failed: ' + err.message); }
  };
  warmPartCache().then(render).catch(() => render());
  return { render, saveSetting: async (c) => { await saveAsset({ category: 'setting', name: `${c.cut} ${c.L} mm · ${c.prongs.count} prongs`, data: { gem: { cut: c.cut, L: c.L, W: c.W, gem: c.gem, depth: c.depth }, prongs: c.prongs, cutter: c.cutter } }); api.toast('Gem setting saved to the Library'); render(); } };
}
