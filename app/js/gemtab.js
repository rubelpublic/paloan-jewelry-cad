// 💎 Gem tools tab: create & customise gems, prongs and cutters, place them on any surface (single / row / mirrored),
// compact to a target gap, show colour-coded distances and a colour-coded gem map with legend + PNG export.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUTS, GEMS, gemLibraryOptions, caratFromDims } from './data.js';
import { GEM_DEFAULTS, rowPositions, compactGems, gemInventory, gemGaps } from './geom/gems.js';

const PALETTE = [0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe, 0x008080, 0xe6beff, 0x9a6324, 0x800000, 0xaaffc3, 0x808000];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const r3 = (v) => Math.round(v * 1000) / 1000;

export function initGemTab(api) {
  const $ = (s) => document.querySelector(s);
  const { root, scene, camera, canvas } = api;
  let mode = null, rowA = null, surf = null, surfVersion = -1, version = 0, distLines = null, mapOn = false, lastInv = [];
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6aa8ff }));
  marker.visible = false; scene.add(marker);

  // ---------- form ----------
  $('#gtCut').innerHTML = Object.entries(CUTS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  $('#gtGem').innerHTML = Object.entries(GEMS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('');
  const fillLib = () => { $('#gtLib').innerHTML = Object.entries(gemLibraryOptions($('#gtCut').value, $('#gtGem').value)).map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); };
  fillLib();
  $('#gtCut').onchange = () => { fillLib(); syncCt(); };
  $('#gtGem').onchange = () => { fillLib(); syncCt(); };
  $('#gtLib').onchange = (e) => { if (!e.target.value) return; const [L, W] = e.target.value.split('x').map(Number); $('#gtL').value = L; $('#gtW').value = W; syncCt(); };
  const syncCt = () => { $('#gtCt').textContent = `${caratFromDims($('#gtCut').value, +$('#gtL').value, +$('#gtW').value, $('#gtGem').value).toFixed(3)} ct each`; };
  ['#gtL', '#gtW'].forEach((s) => { $(s).oninput = syncCt; });
  syncCt();
  const num = (s, d) => { const v = parseFloat($(s).value); return Number.isFinite(v) ? v : d; };
  function current() {
    return {
      cut: $('#gtCut').value, L: num('#gtL', 1.5), W: num('#gtW', 1.5), gem: $('#gtGem').value, depth: num('#gtDepth', 0.05), rot: num('#gtRot', 0),
      prongs: { count: +$('#gtPCount').value, dia: num('#gtPDia', 0.45), height: num('#gtPH', 0.3), tip: $('#gtPTip').value, overlap: num('#gtPOv', 0.12) },
      cutter: { on: $('#gtCOn').checked, tol: num('#gtCTol', 0.04), top: num('#gtCTop', 1.2), hole: $('#gtCHole').checked, holeRatio: num('#gtCHoleR', 0.55), holeDepth: num('#gtCHoleD', 1.6) },
    };
  }
  /** Fill the form from a library asset patch {gem, prongs, cutter}. */
  function applyPreset(p) {
    if (p.gem) { $('#gtCut').value = p.gem.cut || 'round'; fillLib(); $('#gtL').value = p.gem.L; $('#gtW').value = p.gem.W; $('#gtGem').value = p.gem.gem || 'diamond'; if (p.gem.depth !== undefined) $('#gtDepth').value = p.gem.depth; }
    if (p.prongs) { $('#gtPCount').value = String(p.prongs.count ?? 0); $('#gtPDia').value = p.prongs.dia ?? 0.45; $('#gtPH').value = p.prongs.height ?? 0.3; $('#gtPTip').value = p.prongs.tip || 'bead'; }
    if (p.cutter) { $('#gtCOn').checked = p.cutter.on !== false; $('#gtCTol').value = p.cutter.tol ?? 0.04; $('#gtCTop').value = p.cutter.top ?? 1.2; $('#gtCHole').checked = !!p.cutter.hole; $('#gtCHoleR').value = p.cutter.holeRatio ?? 0.55; $('#gtCHoleD').value = p.cutter.holeDepth ?? 1.6; }
    syncCt();
  }

  // ---------- surface snapping ----------
  // snapping surface = the piece WITHOUT placed gems, their prongs or seats (otherwise gems fall into old seat holes)
  let surfKey = '';
  function surface() {
    const p = { ...api.getParams() }; delete p.gems;
    const key = JSON.stringify(p);
    if (surf && surfKey === key) return surf;
    const model = api.generate(api.getType(), p, { csg: false });
    const geos = model.parts.filter((pt) => pt.kind === 'metal').flatMap((pt) => pt.pieces).map((g0) => { const g = g0.index ? g0.toNonIndexed() : g0.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return g; });
    if (!geos.length) return null;
    const g = mergeGeometries(geos, false);
    surf = { g, bvh: new MeshBVH(g) }; surfKey = key; surfVersion = version;
    return surf;
  }
  const faceNormal = (g, f) => {
    const p = g.attributes.position, a = new THREE.Vector3().fromBufferAttribute(p, f * 3), b = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 2);
    return b.sub(a).cross(c.sub(a)).normalize();
  };
  function project(pt) {
    const s = surface(); if (!s) return null;
    const t = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    s.bvh.closestPointToPoint(pt, t);
    const ix = s.g.index ? s.g.index.array : null;
    const f = t.faceIndex;
    const n = ix ? (() => { const p = s.g.attributes.position; const a = new THREE.Vector3().fromBufferAttribute(p, ix[f * 3]), b = new THREE.Vector3().fromBufferAttribute(p, ix[f * 3 + 1]), c = new THREE.Vector3().fromBufferAttribute(p, ix[f * 3 + 2]); return b.sub(a).cross(c.sub(a)).normalize(); })() : faceNormal(s.g, f);
    return { p: t.point.clone(), n };
  }

  // ---------- placement ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!mode || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(root.children.filter((c) => c.isMesh && c.visible && c.userData.kind === 'metal'), false)[0];
    if (!hit) return api.toast('Click on the metal surface.');
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(ray.ray.direction) > 0) n.negate();
    const p = hit.point.clone();
    if (mode === 'single') addGems([{ p, n }]);
    else if (mode === 'row') {
      if (!rowA) { rowA = { p, n }; marker.position.copy(p); marker.visible = true; api.toast('Row: now click the end point.'); return; }
      const c = current();
      const pts = rowPositions(rowA.p.toArray(), p.toArray(), Math.max(c.L, c.W), num('#gtGap', 0.15));
      const placed = pts.map((q) => project(q) || { p: q, n });
      marker.visible = false; rowA = null;
      addGems(placed);
    }
  });
  function addGems(spots) {
    const c = current(), mirror = $('#gtMirror').checked;
    const existing = api.getParams().gems || [];
    const minD = Math.max(c.L, c.W) * 0.9;
    const free = (p, list) => [...existing, ...list].every((g) => Math.hypot(g.p[0] - p[0], g.p[1] - p[1], g.p[2] - p[2]) > minD);
    const list = [];
    for (const s of spots) {
      const p = s.p.toArray().map(r3);
      if (free(p, list)) list.push({ ...c, p, n: s.n.toArray().map(r3) });
      const q = [-s.p.x, s.p.y, s.p.z].map(r3);
      if (mirror && Math.abs(s.p.x) > minD / 2 && free(q, list)) list.push({ ...c, p: q, n: [-s.n.x, s.n.y, s.n.z].map(r3) });
    }
    if (!list.length) return api.toast('A gem is already there — move the cursor or delete the old one.');
    const gems = [...existing, ...list];
    api.commit({ gems }, `Placed ${list.length} gem(s) — ${gems.length} total`);
  }
  function setMode(m) {
    mode = mode === m ? null : m; rowA = null; marker.visible = false;
    $('#gtPlace').classList.toggle('on', mode === 'single');
    $('#gtRow').classList.toggle('on', mode === 'row');
    canvas.style.cursor = mode ? 'crosshair' : '';
    if (mode) api.toast(mode === 'single' ? 'Click on the metal to place gems (Esc to stop).' : 'Row: click the start point, then the end point.');
  }
  $('#gtPlace').onclick = () => setMode('single');
  $('#gtRow').onclick = () => setMode('row');
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode) setMode(mode); });
  $('#gtUndo').onclick = () => { const g = [...(api.getParams().gems || [])]; g.pop(); api.commit({ gems: g }, 'Removed last gem'); };
  $('#gtClear').onclick = () => { if (confirm('Delete all placed gems?')) api.commit({ gems: [] }, 'All placed gems removed'); };
  $('#gtCompact').onclick = () => {
    const gems = api.getParams().gems || [];
    if (gems.length < 2) return api.toast('Place at least two gems first.');
    const out = compactGems(gems, num('#gtGap', 0.15), (q) => project(q));
    api.commit({ gems: out }, `Compacted ${gems.length} gems to a ${num('#gtGap', 0.15)} mm gap`);
  };
  $('#gtResnap').onclick = () => {
    const gems = api.getParams().gems || [];
    const out = gems.map((g) => { const s = project(new THREE.Vector3(...g.p)); return s ? { ...g, p: s.p.toArray().map(r3), n: s.n.toArray().map(r3) } : g; });
    api.commit({ gems: out }, 'Gems re-snapped to the surface');
  };
  $('#gtApplyAll').onclick = () => {
    const c = current();
    const gems = (api.getParams().gems || []).map((g) => ({ ...g, cut: c.cut, L: c.L, W: c.W, gem: c.gem, depth: c.depth, prongs: c.prongs, cutter: c.cutter }));
    api.commit({ gems }, 'Gem / prong / cutter settings applied to all placed gems');
  };
  $('#gtDist').onclick = (e) => { e.currentTarget.classList.toggle('on'); drawDistances(); };
  $('#gtMap').onclick = (e) => { mapOn = !mapOn; e.currentTarget.classList.toggle('on', mapOn); api.refresh(); };
  $('#gtMapPng').onclick = () => downloadGemMap();
  $('#gtSaveAsset').onclick = () => api.saveSetting(current());

  // ---------- after every build ----------
  function afterBuild(model, params) {
    version++;
    lastInv = gemInventory(model, params);
    const gaps = gemGaps(lastInv);
    const minGap = gaps.length ? Math.min(...gaps.map((g) => g.gap)) : null;
    const coll = gaps.filter((g) => g.gap < 0.05).length;
    $('#gtStats').innerHTML = `<b>${lastInv.reduce((s, g) => s + g.qty, 0)}</b> gems · <b>${lastInv.reduce((s, g) => s + g.qty * g.ctEach, 0).toFixed(3)}</b> ct total · placed: <b>${(params.gems || []).length}</b><br>Closest gap: <b>${minGap == null ? '—' : minGap.toFixed(3) + ' mm'}</b> · collisions (&lt; 0.05 mm): <b style="color:${coll ? 'var(--fail)' : 'var(--pass)'}">${coll}</b>`;
    $('#gtList').innerHTML = (params.gems || []).map((g, i) => `<li><span>${i + 1}. ${CUTS[g.cut]?.label || g.cut} ${g.L}×${g.W} ${g.gem} · ${caratFromDims(g.cut, g.L, g.W, g.gem).toFixed(3)} ct · ${g.prongs?.count || 0} prongs</span><button data-del="${i}" title="Delete">×</button></li>`).join('') || '<li class="muted">No placed gems yet.</li>';
    document.querySelectorAll('#gtList [data-del]').forEach((b) => b.onclick = () => { const gs = [...(api.getParams().gems || [])]; gs.splice(+b.dataset.del, 1); api.commit({ gems: gs }, 'Gem deleted'); });
    model.meta.gemGaps = { min: minGap, collisions: coll, pairs: gaps.length };
    drawDistances(gaps);
  }
  function drawDistances(gaps = gemGaps(lastInv)) {
    if (distLines) { scene.remove(distLines); distLines.geometry.dispose(); distLines = null; }
    if (!$('#gtDist').classList.contains('on') || !gaps.length) return;
    const pos = [], col = [], c = new THREE.Color();
    for (const g of gaps) {
      c.set(g.gap < 0.05 ? 0xff3030 : g.gap < 0.1 ? 0xffa020 : g.gap <= 0.3 ? 0x30d070 : 0x4aa0ff);
      pos.push(...g.a.toArray(), ...g.b.toArray()); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    distLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    distLines.renderOrder = 10; scene.add(distLines);
  }

  // ---------- colour-coded gem map ----------
  const mapMats = new Map(), metalGrey = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  function legendEntries() {
    const groups = new Map();
    for (const g of lastInv) {
      const key = `${g.cut} ${g.L.toFixed(2)}×${g.W.toFixed(2)} ${g.gem}`;
      const e = groups.get(key) || { key, cut: g.cut, L: g.L, W: g.W, gem: g.gem, qty: 0, ct: 0, parts: [] };
      e.qty += g.qty; e.ct += g.qty * g.ctEach; e.parts.push(g.part); groups.set(key, e);
    }
    return [...groups.values()].sort((a, b) => b.L * b.W - a.L * a.W).map((e, i) => ({ ...e, color: PALETTE[i % PALETTE.length] }));
  }
  function afterShow() {
    const leg = $('#gemLegend');
    if (!mapOn) { leg.classList.add('hidden'); return; }
    const entries = legendEntries();
    const colorOf = new Map(); entries.forEach((e) => e.parts.forEach((p) => colorOf.set(p, e.color)));
    for (const m of root.children) {
      if (!m.isMesh) continue;
      if (m.userData.kind === 'stone') {
        const c = colorOf.get(m.name) ?? 0xffffff;
        if (!mapMats.has(c)) mapMats.set(c, new THREE.MeshBasicMaterial({ color: c }));
        m.material = mapMats.get(c);
      } else m.material = metalGrey;
    }
    leg.innerHTML = `<b>Gem map</b><table>${entries.map((e) => `<tr><td><i style="background:${hex(e.color)}"></i></td><td>${CUTS[e.cut]?.label || e.cut}</td><td>${e.L === e.W ? e.L.toFixed(2) : e.L.toFixed(2) + '×' + e.W.toFixed(2)} mm</td><td>× ${e.qty}</td><td>${e.ct.toFixed(3)} ct</td></tr>`).join('')}</table><div class="muted small">Total ${entries.reduce((s, e) => s + e.qty, 0)} gems · ${entries.reduce((s, e) => s + e.ct, 0).toFixed(3)} ct</div>`;
    leg.classList.remove('hidden');
  }
  function gemMapImage(w = 1400) {
    const was = mapOn; mapOn = true; api.refresh(true);
    const entries = legendEntries();
    api.render();
    const src = api.canvas;
    const h = Math.round((w * src.height) / src.width);
    const lh = 34, legendH = 70 + entries.length * lh;
    const c = document.createElement('canvas'); c.width = w; c.height = h + legendH;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, w, h);
    x.fillStyle = '#111'; x.font = 'bold 26px Inter, sans-serif'; x.fillText('Gem map — Paloan Jewelry CAD Master', 24, h + 40);
    x.font = '22px Inter, sans-serif';
    entries.forEach((e, i) => {
      const y = h + 70 + i * lh;
      x.fillStyle = hex(e.color); x.fillRect(24, y - 20, 26, 26);
      x.fillStyle = '#111';
      x.fillText(`${CUTS[e.cut]?.label || e.cut}  ${e.L === e.W ? e.L.toFixed(2) : e.L.toFixed(2) + ' × ' + e.W.toFixed(2)} mm  ${GEMS[e.gem]?.label || e.gem}   × ${e.qty}   ${e.ct.toFixed(3)} ct`, 64, y);
    });
    mapOn = was; api.refresh(true);
    return c.toDataURL('image/png');
  }
  function downloadGemMap() {
    if (!lastInv.length) return api.toast('No gems in this design yet.');
    const a = Object.assign(document.createElement('a'), { href: gemMapImage(), download: 'paloan-gem-map.png' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  return { afterBuild, afterShow, applyPreset, current, gemMapImage, legendEntries, inventory: () => lastInv, isMap: () => mapOn };
}
