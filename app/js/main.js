// Paloan Jewelry CAD Master — app controller.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { METALS, GEMS, STYLE_NOTES, usToEu, usToUk, usToIndia } from './data.js';
import { SCHEMAS } from './schema.js';
import { STYLE_PRESETS, TEMPLATES } from './presets.js';
import { generate, measure, prepare, fontsNeeded } from './engine.js';
import { imageStore, exportField, importField } from './image3d.js';
import { registerFontFile } from './fonts.js';
import { initImageTab } from './imagetab.js';
import { initVariations } from './variations.js';
import { initEditor } from './editor.js';
import { parseEdit } from './aiedit.js';
import { validate } from './validate.js';
import { optimizeWeight } from './optimize.js';
import { merge, resample } from './geom/util.js';
import { parseBrief } from './brief.js';
import { askAI, aiSettings, PROVIDERS, fileToImage, resetConversation } from './ai.js';
import { autoFixPatch, matchingSet, mixStyles } from './designtools.js';
import { rasterize, computeMask, analyzeImage } from './image3d.js';
import { loadMeshFile, guessUnit, analyzeMesh, reportMarkdown } from './analyzer.js';
import { rhinoScript, workflow, workflowHtml, workflowMd } from './rhino.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };

const S = { type: 'ring', params: {}, model: null, m: null, v: null, hidden: new Set(), mesh: null, meshReport: null, mode: 'design', images: [], zoneColors: true, section: false, wire: false, showStones: true, showDims: true };

/* ============================== VIEWER ============================== */
const canvas = $('#c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
camera.position.set(28, 22, 42);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(30, 50, 40); scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.5));
const grid = new THREE.GridHelper(100, 100, 0x3a3f4a, 0x23262d); grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
const root = new THREE.Group(); scene.add(root);
const dimsBox = new THREE.Box3Helper(new THREE.Box3(), 0x6aa8ff); dimsBox.material.transparent = true; dimsBox.material.opacity = 0.5; scene.add(dimsBox);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

const metalMats = {}, stoneMats = {};
const FINISH = { polished: { r: 0, cc: 0.3 }, satin: { r: 0.22, cc: 0 }, matte: { r: 0.42, cc: 0 }, brushed: { r: 0.18, cc: 0, aniso: 0.85 }, oxidized: { r: 0.3, cc: 0, dark: true } };
function metalMat(k, finish = 'polished') {
  const key = k + '|' + finish;
  if (!metalMats[key]) {
    const m = METALS[k] || METALS['18ky'], fz = FINISH[finish] || FINISH.polished;
    const col = new THREE.Color(m.color);
    if (fz.dark) col.multiplyScalar(0.28);
    metalMats[key] = new THREE.MeshPhysicalMaterial({ color: col, metalness: 1, roughness: Math.min(0.9, m.rough + fz.r), clearcoat: fz.cc, clearcoatRoughness: 0.2, anisotropy: fz.aniso || 0, side: THREE.DoubleSide });
  }
  return metalMats[key];
}
const ENAMEL = { green: 0x2f9e5a, pink: 0xe58fb0, blue: 0x2f5fc4, white: 0xf3f1ea, black: 0x15151a, red: 0xb52235 };
const enamelMats = {};
function enamelMat(k) {
  if (!enamelMats[k]) enamelMats[k] = new THREE.MeshPhysicalMaterial({ color: ENAMEL[k] || 0x2f9e5a, metalness: 0.05, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  return enamelMats[k];
}
function stoneMat(k) {
  if (!stoneMats[k]) { const g = GEMS[k] || GEMS.diamond; stoneMats[k] = new THREE.MeshPhysicalMaterial({ color: g.color, metalness: 0, roughness: 0, transmission: k === 'onyx' ? 0 : 0.92, thickness: 2, ior: Math.min(g.ior, 2.333), specularIntensity: 1, envMapIntensity: 2.2, flatShading: true }); }
  return stoneMats[k];
}
const zoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
const plainMat = new THREE.MeshPhysicalMaterial({ color: 0xc9c6bd, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide });

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
(function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();

let fitted = null;
function fitView(view = 'iso', force = false) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
  const d = s * 1.55 + 4;
  const dirs = { iso: [0.55, 0.42, 0.9], front: [0, 0, 1], top: [0, 1, 0.0001], side: [1, 0, 0] };
  const v = new THREE.Vector3(...dirs[view]).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(v, d);
  camera.near = d / 100; camera.far = d * 20; camera.updateProjectionMatrix();
  grid.position.y = box.min.y - 0.01;
  fitted = force ? null : fitted;
}

function applyMaterials() {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material.wireframe = S.wire;
    o.material.clippingPlanes = S.section ? [clipPlane] : [];
    o.material.needsUpdate = true;
  });
}

/* ============================== DESIGN STATE ============================== */
function defaultsFor(type) { return { finish: 'polished', headMetal: 'same', ...structuredClone(SCHEMAS[type].defaults) }; }
function setType(type, params = null) {
  S.type = type;
  S.params = { ...defaultsFor(type), ...(params || {}) };
  $('#selType').value = type;
  pushHistory();
  renderForm();
  rebuild(true);
}

function renderForm() {
  const form = $('#params');
  const sch = SCHEMAS[S.type];
  const open = store.get('pjc.openGroups', ['Material', 'Shank', 'Center stone', 'Body', 'Type', 'Size', 'Chain', 'Hoop', 'Drop']);
  const groups = {};
  for (const fd of sch.fields) (groups[fd.g] ||= []).push(fd);
  form.innerHTML = '';
  for (const [g, fields] of Object.entries(groups)) {
    const fs = document.createElement('fieldset');
    if (!open.includes(g)) fs.classList.add('collapsed');
    fs.innerHTML = `<legend>${g}</legend>`;
    fs.querySelector('legend').onclick = () => {
      fs.classList.toggle('collapsed');
      const now = $$('#params fieldset').filter((x) => !x.classList.contains('collapsed')).map((x) => x.querySelector('legend').textContent);
      store.set('pjc.openGroups', now);
    };
    for (const fd of fields) fs.appendChild(fieldEl(fd));
    form.appendChild(fs);
  }
  refreshVisibility();
  $('#styleNote').textContent = S.params.style ? STYLE_NOTES[S.params.style] || '' : '';
  $('#svgUpload').classList.toggle('hidden', !(S.type === 'pendant' && S.params.shape === 'custom'));
}

function fieldEl(fd) {
  const d = document.createElement('div');
  d.dataset.k = fd.k;
  const v = S.params[fd.k];
  if (fd.t === 'text') {
    d.className = 'f sel';
    d.innerHTML = `<span>${fd.label}</span><input type="text" maxlength="40" value="${esc(v ?? '')}">`;
    const inp = d.querySelector('input');
    let tt = 0;
    inp.oninput = () => { clearTimeout(tt); tt = setTimeout(() => onParam(fd.k, inp.value), 350); };
  } else if (fd.t === 'select') {
    const opts = typeof fd.opts === 'function' ? fd.opts(S.params) : fd.opts;
    d.className = 'f sel';
    d.innerHTML = `<span>${fd.label}</span><select>${Object.entries(opts).map(([k, l]) => `<option value="${k}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    d.querySelector('select').onchange = (e) => onParam(fd.k, e.target.value);
  } else if (fd.t === 'check') {
    d.className = 'f chk';
    d.innerHTML = `<label><input type="checkbox"${v ? ' checked' : ''}/> ${fd.label}</label>`;
    d.querySelector('input').onchange = (e) => onParam(fd.k, e.target.checked);
  } else if (fd.t === 'number') {
    d.className = 'f';
    d.innerHTML = `<span>${fd.label}</span><input type="number" min="${fd.min}" max="${fd.max}" step="${fd.step}" value="${v ?? 0}" style="grid-column:1/-1">`;
    d.querySelector('input').onchange = (e) => onParam(fd.k, parseFloat(e.target.value) || 0);
  } else {
    d.className = 'f';
    d.innerHTML = `<span>${fd.label}<em class="muted">${fd.unit || ''}</em></span><input type="range" min="${fd.min}" max="${fd.max}" step="${fd.step}" value="${v}"><input type="number" min="${fd.min}" max="${fd.max}" step="${fd.step}" value="${v}">`;
    const [r, n] = d.querySelectorAll('input');
    r.oninput = () => { n.value = r.value; onParam(fd.k, parseFloat(r.value), true); };
    r.onchange = () => onParam(fd.k, parseFloat(r.value));
    n.onchange = () => { r.value = n.value; onParam(fd.k, parseFloat(n.value)); };
  }
  return d;
}
function refreshVisibility() {
  for (const fd of SCHEMAS[S.type].fields) {
    const el = $(`#params [data-k="${fd.k}"]`);
    if (el) el.classList.toggle('hidden', fd.show ? !fd.show(S.params) : false);
  }
}
function syncForm() {
  for (const fd of SCHEMAS[S.type].fields) {
    const el = $(`#params [data-k="${fd.k}"]`); if (!el) continue;
    const v = S.params[fd.k];
    if (fd.t === 'check') el.querySelector('input').checked = !!v;
    else el.querySelectorAll('input,select').forEach((i) => { i.value = v; });
  }
  refreshVisibility();
  $('#styleNote').textContent = S.params.style ? STYLE_NOTES[S.params.style] || '' : '';
}

function onParam(k, v, dragging = false) {
  S.params[k] = v;
  if (k === 'style' && STYLE_PRESETS[S.type]?.[v]) { Object.assign(S.params, STYLE_PRESETS[S.type][v]); syncForm(); }
  if (k === 'metal') store.set('pjc.metal', v);
  if (k === 'gemSize' && v) { const [L, W] = v.split('x').map(Number); Object.assign(S.params, { sizeMode: 'mm', stoneL: L, stoneW: W }); syncForm(); }
  if ((k === 'cut' || k === 'gem') && !dragging) { S.params.gemSize = ''; renderForm(); }
  if ((k === 'sizeMode' || k === 'carat' || k === 'stoneL' || k === 'stoneW') && S.params.gemSize) { S.params.gemSize = ''; const el = $('#params [data-k="gemSize"] select'); if (el) el.value = ''; }
  if (k === 'shape') $('#svgUpload').classList.toggle('hidden', v !== 'custom');
  refreshVisibility();
  if (!dragging) pushHistory();
  rebuild(false, dragging);
}

/* ============================== BUILD ============================== */
let fullTimer = 0, quickTimer = 0, buildId = 0, fullDone = 0;
function rebuild(fit = false, dragging = false) {
  const id = ++buildId;
  clearTimeout(quickTimer);
  quickTimer = setTimeout(() => {
    if (id !== buildId || fullDone === id) return;          // a newer or finished build already owns the viewport
    try { show(generate(S.type, S.params, { csg: false })); if (fit) fitView(); }
    catch (e) { console.error(e); toast('Build error: ' + e.message); }
  }, 0);
  clearTimeout(fullTimer);
  $('#busy').classList.add('on');
  fullTimer = setTimeout(() => {
    if (id !== buildId) return;
    if (fontsNeeded(S.type, S.params).length) {
      $('#busy').textContent = 'Loading font…';
      prepare(S.type, S.params).then(() => { $('#busy').textContent = 'Building…'; if (id === buildId) rebuild(fit); })
        .catch((e) => { $('#busy').textContent = 'Building…'; $('#busy').classList.remove('on'); toast(e.message); });
      return;
    }
    try {
      const model = generate(S.type, S.params, { csg: true });
      const m = measure(model, S.params.metal);
      if (id !== buildId) return;
      S.model = model; S.m = m; S.v = validate(model, m, S.params, S.params.metal);
      fullDone = id;
      show(model); if (fit) fitView(); renderAnalysis(); renderWorkflow(); renderReport();
      saveHash();
    } catch (e) { console.error(e); toast('Build error: ' + e.message); }
    $('#busy').classList.remove('on');
  }, dragging ? 650 : 220);
}

function show(model) {
  if (S.mode === 'mesh') return;
  disposeRoot();
  for (const part of model.parts) {
    const geo = part.pieces.length === 1 ? part.pieces[0] : merge(part.pieces, part.kind === 'stone' ? 0.01 : 0.6);
    if (!geo) continue;
    const mat = part.kind === 'stone' ? stoneMat(part.gem) : part.enamel ? enamelMat(part.enamel) : metalMat(part.metal || S.params.metal, S.params.finish);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = part.name; mesh.userData.kind = part.kind;
    mesh.visible = !S.hidden.has(part.name) && (part.kind !== 'stone' || S.showStones);
    root.add(mesh);
  }
  applyMaterials();
  const box = new THREE.Box3().setFromObject(root);
  dimsBox.box.copy(box); dimsBox.visible = S.showDims && !box.isEmpty();
  grid.position.y = box.min.y - 0.01;
  updateHud(model, box);
  editor?.reselect();
}
function disposeRoot() { while (root.children.length) { const c = root.children.pop(); if (c.geometry && !c.userData.keepGeo) c.geometry.dispose?.(); } }

function updateHud(model, box) {
  const s = box.getSize(new THREE.Vector3()), meta = model.meta;
  const L = [`W ${f(s.x)} × H ${f(s.y)} × D ${f(s.z)} mm`];
  if (meta.type === 'ring') L.push(`Inner Ø ${f(meta.innerDiameter)} mm · US ${meta.ringSize} · UK ${usToUk(meta.ringSize)} · EU ${f(usToEu(meta.ringSize), 1)} · IN ${usToIndia(meta.ringSize)}`);
  if (meta.stone) L.push(`Stone ${f(meta.stone.L)} × ${f(meta.stone.W)} mm${meta.headHeight ? ` · head height ${f(meta.headHeight)} mm` : ''}`);
  if (meta.type === 'chain') L.push(`${meta.linkCount} links · ${f(meta.lengthMm / 10, 1)} cm`);
  $('#hud').innerHTML = L.map(esc).join('<br>');
}

/* ============================== ANALYSIS UI ============================== */
function renderAnalysis() {
  const { m, v, model } = S;
  const metal = METALS[S.params.metal];
  $('#wGrams').textContent = f(m.grams);
  $('#wMetal').textContent = `${metal.label}${m.pair ? ' · pair' : ''}`;
  const price = parseFloat($('#priceG').value);
  const kv = [
    ...(m.byMetal && Object.keys(m.byMetal).length > 1 ? Object.entries(m.byMetal).map(([k, g]) => [METALS[k].label, `${f(g)} g`]) : []),
    ['Metal volume', `${f(m.volume, 1)} mm³`],
    ['Cast weight (+4%)', `${f(m.grams * 1.04)} g`],
    ['Resin / wax model', `${f(m.volume / 1000 * 1.1, 2)} g`],
    ['Surface area', `${f(m.area / 100, 1)} cm²`],
    m.stoneCt ? ['Stones (total)', `${f(m.stoneCt, 2)} ct`] : null,
    ['Bounding box', `${f(m.bbox.x, 1)} × ${f(m.bbox.y, 1)} × ${f(m.bbox.z, 1)} mm`],
    S.params.targetWeight > 0 ? ['Target', `${f(S.params.targetWeight)} g (${m.grams > S.params.targetWeight ? '+' : ''}${f(m.grams - S.params.targetWeight)} g)`] : null,
    price > 0 ? ['Metal cost', `${f(m.grams * 1.04 * price, 0)} ${esc($('#currency').value)}`] : null,
  ].filter(Boolean);
  $('#wKv').innerHTML = kv.map(([a, b]) => `<b>${a}</b><span>${b}</span>`).join('');
  $('#alloys').innerHTML = Object.entries(METALS).map(([k, mt]) => `<tr class="${k === S.params.metal ? 'cur' : ''}"><td>${mt.label}</td><td>${f(m.volume * mt.density / 1000 * (m.pair ? 2 : 1))} g</td></tr>`).join('');
  const sc = $('#score'); sc.textContent = `${v.score}/100`; sc.style.color = v.score >= 85 ? 'var(--pass)' : v.score >= 60 ? 'var(--warn)' : 'var(--fail)';
  const order = { fail: 0, warn: 1, pass: 2, info: 3 };
  $('#checks').innerHTML = [...v.checks].sort((a, b) => order[a.level] - order[b.level]).map((c) => `<li class="${c.level}"><b>${esc(c.title)}</b>${esc(c.detail)}${c.fix ? `<div class="fix">→ ${esc(c.fix)}</div>` : ''}</li>`).join('');
  $('#parts').innerHTML = m.parts.map((p) => `<li class="${S.hidden.has(p.name) ? 'off' : ''}" data-n="${esc(p.name)}"><span class="eye" title="Show/hide">${S.hidden.has(p.name) ? '○' : '●'}</span><i class="sw" style="background:${p.kind === 'stone' ? '#bfe3ff' : '#' + metal.color.toString(16).padStart(6, '0')}"></i><span class="nm">${esc(p.name)}<br><span class="ly">${esc(p.layer)}</span></span><span class="small">${p.kind === 'metal' ? f(p.volume, 0) + ' mm³' : ''}</span></li>`).join('');
  $$('#parts li').forEach((li) => { li.querySelector('.eye').onclick = () => { const n = li.dataset.n; S.hidden.has(n) ? S.hidden.delete(n) : S.hidden.add(n); show(model); renderAnalysis(); }; });
}

function renderWorkflow() { if (S.model) $('#workflow').innerHTML = workflowHtml(workflow(S.type, S.params, S.model.meta)); }

/* ============================== REPORT ============================== */
function reportText() {
  const { m, v, model } = S; const p = S.params, meta = model.meta;
  const metal = METALS[p.metal];
  const price = parseFloat($('#priceG').value);
  const L = [`# Paloan production sheet — ${S.type}${p.style ? ` (${p.style})` : ''}`, '', `Generated ${new Date().toLocaleString()} with Paloan Jewelry CAD Master.`, ''];
  L.push('## Summary', '', '| Item | Value |', '|---|---|');
  L.push(`| Metal | ${metal.label} |`, `| Finished weight | **${f(m.grams)} g**${m.pair ? ' (pair)' : ''} |`, `| Cast weight (+4%) | ${f(m.grams * 1.04)} g |`, `| Metal volume | ${f(m.volume, 1)} mm³ |`, `| Bounding box | ${f(m.bbox.x)} × ${f(m.bbox.y)} × ${f(m.bbox.z)} mm |`);
  if (meta.type === 'ring') L.push(`| Ring size | US ${p.ringSize} · UK ${usToUk(p.ringSize)} · EU ${f(usToEu(p.ringSize), 1)} · Ø ${f(meta.innerDiameter)} mm |`, `| Band | ${f(p.widthTop)}→${f(p.widthBottom)} mm wide, ${f(p.thickTop)}→${f(p.thickBottom)} mm thick, ${p.profile} profile, ${p.shankStyle} |`);
  if (meta.stone) L.push(`| Centre stone | ${meta.stone.cut} ${f(meta.stone.L)} × ${f(meta.stone.W)} mm, ${f(meta.stone.carat)} ct ${meta.stone.gem}, ${meta.headType} setting${meta.prongCount ? `, ${meta.prongCount} prongs Ø ${f(meta.prongDia)} mm` : ''} |`);
  if (meta.haloCount) L.push(`| Halo | ${meta.haloCount} × ${f(meta.haloStone)} mm melee |`);
  if (meta.accentCount) L.push(`| Pavé | ${meta.accentCount} × ${f(meta.accentSize)} mm |`);
  if (m.stoneCt) L.push(`| Total stone weight | ${f(m.stoneCt)} ct |`);
  if (price > 0) L.push(`| Metal cost | ${f(m.grams * 1.04 * price, 2)} ${$('#currency').value} @ ${price}/g |`);
  L.push('', `## Manufacturability — score ${v.score}/100`, '');
  for (const c of v.checks) L.push(`- **[${c.level.toUpperCase()}] ${c.title}** — ${c.detail}${c.fix ? ` _Fix: ${c.fix}_` : ''}`);
  L.push('', '## Weight in other alloys', '', '| Alloy | g |', '|---|---|');
  for (const [k, mt] of Object.entries(METALS)) L.push(`| ${mt.label} | ${f(m.volume * mt.density / 1000 * (m.pair ? 2 : 1))} |`);
  L.push('', '## Components (detachable polysurfaces)', '', '| Part | Layer | Volume mm³ |', '|---|---|---|');
  for (const pt of m.parts) L.push(`| ${pt.name} | ${pt.layer} | ${pt.kind === 'metal' ? f(pt.volume, 1) : 'stone'} |`);
  L.push('', '## CAD construction plan', '', workflowMd(workflow(S.type, p, meta)));
  L.push('', '## Parameters', '', '```json', JSON.stringify({ type: S.type, ...p, customOutline: p.customOutline ? '[custom]' : undefined }, null, 2), '```');
  return L.join('\n');
}
function renderReport() { if (S.model && S.mode !== 'mesh') $('#reportView').innerHTML = `<div class="md">${md(reportText())}</div>`; }

/* ============================== MARKDOWN (small, safe) ============================== */
function md(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '', inCode = false, list = null, table = null;
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<i>$2</i>').replace(/\*([^*\s][^*]*)\*/g, '<i>$1</i>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } if (table) { html += '</table>'; table = null; } };
  for (const ln of lines) {
    if (ln.startsWith('```')) { if (inCode) { html += '</code></pre>'; inCode = false; } else { close(); html += '<pre><code>'; inCode = true; } continue; }
    if (inCode) { html += esc(ln) + '\n'; continue; }
    let mm;
    if ((mm = ln.match(/^(#{1,4})\s+(.*)/))) { close(); html += `<h${mm[1].length}>${inline(mm[2])}</h${mm[1].length}>`; continue; }
    if (/^\s*\|/.test(ln)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(ln)) continue;
      if (!table) { close(); html += '<table>'; table = true; }
      html += '<tr>' + ln.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>';
      continue;
    }
    if ((mm = ln.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      const t = /\d/.test(mm[1]) ? 'ol' : 'ul';
      if (list !== t) { close(); html += `<${t}>`; list = t; }
      html += `<li>${inline(mm[2])}</li>`; continue;
    }
    close();
    if (ln.trim()) html += `<p>${inline(ln)}</p>`;
  }
  close(); if (inCode) html += '</code></pre>';
  return html;
}

/* ============================== OPTIMIZER ============================== */
$('#btnOptimize').onclick = async () => {
  const target = S.params.targetWeight;
  if (!(target > 0)) { toast('Set “Target weight” in the Material group first.'); $('#params fieldset')?.classList.remove('collapsed'); return; }
  const btn = $('#btnOptimize'); btn.disabled = true;
  $('#busy').classList.add('on');
  try {
    const r = await optimizeWeight(S.type, S.params, S.params.metal, target, (t) => { $('#busy').textContent = t; });
    S.params = r.params; syncForm(); rebuild();
    showMsg('Weight optimisation', r.log.map((x) => '- ' + x).join('\n'));
    toast(`${f(r.start)} g → ${f(r.grams)} g`);
  } catch (e) { console.error(e); toast('Optimiser error: ' + e.message); }
  $('#busy').textContent = 'Building…'; $('#busy').classList.remove('on'); btn.disabled = false;
};
function showMsg(title, body) {
  const box = document.createElement('div'); box.className = 'card md'; box.innerHTML = `<b>${esc(title)}</b>${md(body)}`;
  const rp = $('#rightPanel'); rp.insertBefore(box, rp.children[1]);
  setTimeout(() => box.remove(), 30000);
}

/* ============================== TABS / TOOLS ============================== */
$$('.tabs button').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
function setTab(t) {
  $$('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  $$('.panel.left section').forEach((x) => x.classList.toggle('on', x.dataset.panel === t));
  const toMesh = t === 'mesh', wasMesh = S.mode === 'mesh';
  S.mode = toMesh ? 'mesh' : 'design';
  if (toMesh && !wasMesh) { disposeRoot(); if (S.mesh) showMesh(); renderMeshPanel(); }
  if (!toMesh && wasMesh) { $('#rightPanel').innerHTML = rightPanelHtml; bindRight(); if (S.model) { show(S.model); renderAnalysis(); fitView(); } }
}
const rightPanelHtml = $('#rightPanel').innerHTML;
function bindRight() { /* parts toggles are rebound in renderAnalysis */ }

$$('.vp-tools [data-view]').forEach((b) => b.onclick = () => fitView(b.dataset.view));
$('#tglWire').onclick = (e) => { S.wire = !S.wire; e.currentTarget.classList.toggle('on', S.wire); applyMaterials(); };
$('#tglSection').onclick = (e) => { S.section = !S.section; e.currentTarget.classList.toggle('on', S.section); applyMaterials(); };
$('#tglStones').onclick = (e) => { S.showStones = !S.showStones; e.currentTarget.classList.toggle('on', S.showStones); root.children.forEach((c) => { if (c.userData.kind === 'stone') c.visible = S.showStones && !S.hidden.has(c.name); }); };
$('#tglDims').onclick = (e) => { S.showDims = !S.showDims; e.currentTarget.classList.toggle('on', S.showDims); dimsBox.visible = S.showDims; $('#hud').style.display = S.showDims ? '' : 'none'; };
$('#fileRef').onchange = (e) => { const fl = e.target.files[0]; if (!fl) return; const img = $('#refOverlay'); img.src = URL.createObjectURL(fl); img.style.display = 'block'; img.style.opacity = $('#refOpacity').value; S.refFile = fl; toast('Reference overlay on — orbit the model to match the view.'); };
$('#refOverlay').ondblclick = () => { $('#refOverlay').style.display = 'none'; };
$('#refOpacity').oninput = (e) => { $('#refOverlay').style.opacity = e.target.value; };

$('#selType').onchange = (e) => { S.hidden.clear(); setType(e.target.value, { metal: S.params.metal }); };
const tsel = $('#selTemplate');
tsel.innerHTML += TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
tsel.onchange = () => {
  const t = TEMPLATES.find((x) => x.id === tsel.value); if (!t) return;
  const base = { ...defaultsFor(t.type) };
  if (t.params.style && STYLE_PRESETS[t.type]?.[t.params.style]) Object.assign(base, STYLE_PRESETS[t.type][t.params.style]);
  S.hidden.clear();
  setType(t.type, { ...base, ...t.params });
  tsel.value = '';
};
$('#btnReset').onclick = () => setType(S.type, { metal: S.params.metal });

/* custom SVG outline */
$('#fileSvg').onchange = async (e) => {
  const fl = e.target.files[0]; if (!fl) return;
  try {
    const data = new SVGLoader().parse(await fl.text());
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    if (!shapes.length) throw new Error('No closed shapes in SVG');
    const best = shapes.map((s) => s.getPoints(96)).sort((a, b) => area(b) - area(a))[0];
    const pts = resample(best.map((v) => [v.x, -v.y]), 160);
    S.params.customOutline = pts; S.params.shape = 'custom'; syncForm(); rebuild(true);
    toast('SVG outline loaded — set height/width to scale it.');
  } catch (err) { toast('SVG error: ' + err.message); }
};
const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/* project save / load / share */
const usesImage = () => S.type === 'relief' || (S.type === 'ring' && String(S.params.signetFace || '').startsWith('image'));
const projectJson = () => JSON.stringify({ app: 'paloan-jewelry-cad', version: 2, type: S.type, params: S.params, image: usesImage() ? exportField() : undefined }, null, 2);
$('#btnSaveProj').onclick = () => download(`paloan-${S.type}-${Date.now()}.json`, projectJson(), 'application/json');
$('#fileProj').onchange = async (e) => {
  const fl = e.target.files[0]; if (!fl) return;
  try { const j = JSON.parse(await fl.text()); if (!SCHEMAS[j.type]) throw new Error('Not a Paloan project'); if (j.image) importField(j.image); setType(j.type, j.params); toast('Project loaded'); }
  catch (err) { toast('Open failed: ' + err.message); }
};
function saveHash() {
  try {
    const p = { ...S.params }; if (p.customOutline) delete p.customOutline;
    history.replaceState(null, '', '#d=' + btoa(unescape(encodeURIComponent(JSON.stringify({ t: S.type, p })))));
  } catch { /* ignore */ }
}
$('#btnShare').onclick = async () => { saveHash(); try { await navigator.clipboard.writeText(location.href); toast('Share link copied'); } catch { toast('Copy the URL from the address bar'); } };

/* exports */
function download(name, data, type = 'text/plain') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportGroup(metalOnly) {
  const g = new THREE.Group();
  root.children.forEach((c) => { if (c.isMesh && c.visible && (!metalOnly || c.userData.kind === 'metal')) g.add(new THREE.Mesh(c.geometry, c.material)); });
  g.rotation.x = Math.PI / 2;                       // Y-up viewer → Z-up CAD/printing convention
  g.updateMatrixWorld(true);
  return g;
}
const baseName = () => `paloan-${S.type}-${S.params.style || 'custom'}`;
$('#btnStl').onclick = () => download(baseName() + '-metal.stl', new Blob([new STLExporter().parse(exportGroup(true), { binary: true })]));
$('#btnStlAll').onclick = () => download(baseName() + '.stl', new Blob([new STLExporter().parse(exportGroup(false), { binary: true })]));
$('#btnObj').onclick = () => download(baseName() + '.obj', new OBJExporter().parse(exportGroup(false)));
$('#btnGlb').onclick = () => new GLTFExporter().parse(exportGroup(false), (r) => download(baseName() + '.glb', new Blob([r])), (e) => toast('GLB error ' + e), { binary: true });
/** Geometry Rhino cannot rebuild from parameters alone (image reliefs, text outlines, engraving cutters). */
function rhinoExtras() {
  const q = (a) => Array.from(a, (x) => Math.round(x * 1000) / 1000);
  const meshOf = (g) => { const h = g.index ? g : g.toNonIndexed(); const idx = h.index ? Array.from(h.index.array) : [...Array(h.attributes.position.count).keys()]; return { v: q(h.attributes.position.array), f: idx }; };
  const extra = { meshes: [], outlines: [] };
  let src = S.model;
  if (S.type === 'relief' && S.params.res > 110) src = generate(S.type, { ...S.params, res: 110 }, { csg: true });
  if (!src) return extra;
  for (const part of src.parts) {
    if (part.layer === 'Body::Relief' || part.name === 'Signet relief') part.pieces.forEach((g) => extra.meshes.push({ layer: 'Metal::' + part.layer.replace('Shank::', 'Shank::'), name: part.name, kind: 'metal', ...meshOf(g) }));
    if (part.layer.startsWith('Shank::Signet') && part.name.startsWith('Monogram')) part.pieces.forEach((g) => extra.meshes.push({ layer: 'Metal::Shank::Signet', name: part.name, kind: 'metal', ...meshOf(g) }));
  }
  for (const c of src.cutters) if (c.type === 'engrave') [].concat(c.geometry).forEach((g) => extra.meshes.push({ layer: 'Cutters::Engraving', name: 'Engraving cutter', kind: 'cutter', ...meshOf(g) }));
  if (src.meta.export?.outlines) extra.outlines = src.meta.export.outlines;
  if (S.type === 'relief') extra.reliefTop = src.meta.height / 2;
  return extra;
}
const pyScript = () => rhinoScript(S.type, S.params, rhinoExtras());
$('#btnRhinoPy').onclick = async () => { try { download(baseName() + '.py', await pyScript(), 'text/x-python'); } catch (e) { toast(e.message); } };
$('#btnCopyPy').onclick = async () => { try { await navigator.clipboard.writeText(await pyScript()); toast('Rhino script copied'); } catch (e) { toast(e.message); } };
$('#btnCopyJson').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify({ type: S.type, ...S.params })); toast('Params JSON copied — paste into the GhPython “P” input'); } catch (e) { toast(e.message); } };
$('#btnReportMd').onclick = () => download(baseName() + '-report.md', reportText(), 'text/markdown');
$('#btnPrint').onclick = () => { setTab('report'); renderReport(); setTimeout(() => print(), 50); };
$('#btnShot').onclick = () => { renderer.render(scene, camera); canvas.toBlob((b) => download(baseName() + '.png', b)); };
['#priceG', '#currency'].forEach((s) => { $(s).value = store.get('pjc' + s, $(s).value); $(s).onchange = () => { store.set('pjc' + s, $(s).value); if (S.m) { renderAnalysis(); renderReport(); } }; });

/* ============================== AI BRIEF ============================== */
function addMsg(role, html) { const d = document.createElement('div'); d.className = `msg ${role} md`; d.innerHTML = html; $('#aiOut').prepend(d); return d; }
function applyDesign(type, params, notes = []) {
  const base = defaultsFor(type);
  if (params.style && STYLE_PRESETS[type]?.[params.style]) Object.assign(base, STYLE_PRESETS[type][params.style]);
  S.hidden.clear();
  setType(type, { ...base, metal: S.params.metal, ...params });
  setTab('design'); setTab('ai');
  if (notes.length) toast(notes[0]);
}
$('#btnParse').onclick = () => {
  const txt = $('#brief').value.trim(); if (!txt) return toast('Describe the piece first.');
  const r = parseBrief(txt);
  addMsg('user', `<p>${esc(txt)}</p>`);
  addMsg('bot', md(`**Offline parse → ${r.type}**\n\n${r.summary ? '`' + r.summary + '`' : 'No specific parameters recognised — using defaults.'}\n\n${r.notes.map((n) => '- ' + n).join('\n')}\n\n_For image reading and full engineering reasoning use “Ask Claude”._`));
  applyDesign(r.type, r.params, r.notes);
};
function designContext() {
  if (!S.model || !S.m) return '';
  return JSON.stringify({ type: S.type, params: { ...S.params, customOutline: undefined }, measured: { grams: +S.m.grams.toFixed(2), volume_mm3: +S.m.volume.toFixed(1), bbox_mm: S.m.bbox, stones_ct: +S.m.stoneCt.toFixed(2) }, meta: Object.fromEntries(Object.entries(S.model.meta).filter(([k, v]) => typeof v !== 'object' || k === 'stone')), checks: S.v.checks.filter((c) => c.level !== 'info').map((c) => `${c.level}: ${c.title} — ${c.detail}`) }, null, 1);
}
/** Text description of images for AI providers that cannot see pictures (free Pollinations). */
async function notesForImages(images) {
  const notes = [];
  for (const im of images) {
    try {
      const img = new Image(); img.src = `data:${im.media_type};base64,${im.data}`; await img.decode();
      const R = rasterize(img, 240), mk = computeMask(R, { mode: 'auto', fillHoles: false });
      const a = analyzeImage(R, mk);
      if (a.ok) notes.push(`${im.name || 'image'}: looks like a ${a.type}. ${a.notes.join(' ')} Aspect ${a.metrics.aspect.toFixed(2)}, ${a.metrics.holes.count} enclosed openings, ${a.metrics.spikes} sharp points.`);
    } catch { /* skip */ }
  }
  return notes.join('\n');
}
async function runAI(prompt, images, { merge = false, imageNotes = '' } = {}) {
  if (!aiSettings.ready) { openSettings(); toast(`Add your free ${aiSettings.label} key, or pick Pollinations (no key).`); return; }
  addMsg('user', `<p>${esc(prompt)}</p>${images.length ? `<p class="muted small">${images.length} image(s) attached${aiSettings.vision ? '' : ' — described in text for the free model'}</p>` : ''}`);
  const out = addMsg('bot', `<p class="muted">Thinking… (${esc(aiSettings.label)})</p>`);
  if (images.length && !aiSettings.vision && !imageNotes) imageNotes = await notesForImages(images);
  let acc = '';
  const btns = [$('#btnAsk'), $('#btnReview')]; btns.forEach((b) => b.disabled = true);
  try {
    const r = await askAI({ prompt, images, imageNotes, context: designContext(), onText: (d) => { acc += d; out.innerHTML = md(acc); } });
    out.innerHTML = md(r.text);
    if (r.truncated) out.innerHTML += '<p class="muted">(response hit the length limit)</p>';
    if (r.design) {
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = `Build this ${r.design.type}`;
      const go = () => (merge && r.design.type === S.type ? (Object.assign(S.params, r.design.params), renderForm(), pushHistory(), rebuild()) : applyDesign(r.design.type, r.design.params));
      b.onclick = go;
      out.appendChild(b);
      go();
    }
  } catch (e) { out.innerHTML = `<p style="color:var(--fail)">${esc(e.message || e)}</p>`; }
  btns.forEach((b) => b.disabled = false);
}
$('#btnAsk').onclick = () => {
  const txt = $('#brief').value.trim();
  if (!txt && !S.images.length) return toast('Describe the piece or add an image.');
  runAI(txt || 'Convert this jewelry concept image into a manufacturable Rhino NURBS construction plan and build parameters.', S.images.slice());
};
$('#btnReview').onclick = async () => {
  const shot = await new Promise((res) => { renderer.render(scene, camera); canvas.toBlob(res, 'image/png'); });
  const cur = await fileToImage(new File([shot], 'cad.png', { type: 'image/png' }));
  const refs = S.images.length ? S.images : S.refFile ? [await fileToImage(S.refFile)] : [];
  if (!refs.length) return toast('Add a reference image (AI Brief images or the viewport “Ref” overlay) first.');
  runAI('CAD QUALITY REVIEW. The first image(s) are the reference/design intent, the LAST image is a render of the current CAD model. Compare them: proportions, prong alignment, symmetry, carving/openwork depth and spacing, stone placement, surface consistency. List concrete deviations with numeric corrections and give the corrected parameters JSON.', [...refs, cur]);
};
$('#btnChatReset').onclick = () => { resetConversation(); $('#aiOut').innerHTML = ''; toast('New conversation'); };
function addImages(files) {
  [...files].filter((x) => x.type.startsWith('image/')).slice(0, 6).forEach(async (fl) => {
    const im = await fileToImage(fl); S.images.push(im);
    const fig = document.createElement('figure'); fig.innerHTML = `<img src="data:${im.media_type};base64,${im.data}" alt=""><button title="Remove">×</button>`;
    fig.querySelector('button').onclick = () => { S.images.splice(S.images.indexOf(im), 1); fig.remove(); };
    $('#imgThumbs').appendChild(fig);
  });
}
$('#fileImg').onchange = (e) => addImages(e.target.files);
dropZone($('#dropImg'), addImages);

/* settings */
$('#aiProvider').innerHTML = Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
function fillProvider(prov) {
  const P = PROVIDERS[prov];
  const was = aiSettings.provider; aiSettings.provider = prov;
  $('#aiModels').innerHTML = P.models.map((m) => `<option value="${m}">`).join('');
  $('#aiModel').value = aiSettings.model;
  $('#apiKey').value = aiSettings.keyFor(prov);
  $('#aiKeyRow').style.display = P.needsKey ? '' : 'none';
  $('#aiKeyLink').href = P.keyUrl; $('#aiKeyLink').textContent = P.free ? 'Get a free key →' : 'Get a key →';
  $('#aiNote').textContent = prov === 'puter' ? 'Free, no API key: the first request opens a Puter sign-in window (free account). Reads photos and generates images. Model blank = Puter default.' : prov === 'pollinations' ? 'Free key from enter.pollinations.ai (publishable pk_ keys work in the browser). Also powers free concept images.' : P.vision ? 'This provider can read your photos directly.' : '';
  aiSettings.provider = was;
}
function openSettings() { $('#aiProvider').value = aiSettings.provider; fillProvider(aiSettings.provider); $('#aiTestOut').textContent = ''; $('#dlgSettings').showModal(); }
function saveSettings() {
  const prov = $('#aiProvider').value;
  aiSettings.provider = prov;
  if (PROVIDERS[prov].needsKey) aiSettings.set($('#apiKey').value.trim(), $('#rememberKey').checked, prov);
  if ($('#aiModel').value.trim()) aiSettings.model = $('#aiModel').value.trim();
  $('#btnSettings').textContent = '⚙ AI · ' + aiSettings.label;
}
$('#aiProvider').onchange = (e) => fillProvider(e.target.value);
$('#btnSettings').onclick = openSettings;
$('#btnSaveKey').onclick = () => { saveSettings(); toast(aiSettings.ready ? `${aiSettings.label} ready` : 'Key missing for this provider'); };
$('#btnTestAI').onclick = async () => {
  saveSettings();
  $('#aiTestOut').textContent = 'Testing…';
  try {
    const t0 = performance.now();
    const r = await askAI({ prompt: 'Reply with exactly: PALOAN OK' });
    resetConversation();
    $('#aiTestOut').textContent = `✓ ${r.text.trim().slice(0, 40)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`;
  } catch (e) { $('#aiTestOut').textContent = '✗ ' + e.message; }
};
$('#btnSettings').textContent = '⚙ AI · ' + aiSettings.label;

/* ============================== MESH LAB ============================== */
function dropZone(el, cb) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); cb(e.dataTransfer.files); });
}
async function loadMesh(files) {
  const fl = files[0]; if (!fl) return;
  try {
    $('#busy').classList.add('on'); $('#busy').textContent = 'Loading mesh…';
    const geo = await loadMeshFile(fl);
    const unit = $('#meshUnit').value === 'auto' ? guessUnit(geo) : $('#meshUnit').value;
    S.mesh = { geo, name: fl.name, unit, analyzed: null };
    $('#meshUnit').value = unit === 'mm' && $('#meshUnit').value === 'auto' ? 'auto' : unit;
    $('#btnAnalyze').disabled = false; $('#btnZones').disabled = false;
    toast(`${fl.name}: ${(geo.attributes.position.count / 3).toLocaleString()} triangles, units → ${unit}`);
    showMesh(); runMeshAnalysis();
  } catch (e) { console.error(e); toast('Mesh error: ' + e.message); }
  $('#busy').classList.remove('on'); $('#busy').textContent = 'Building…';
}
$('#fileMesh').onchange = (e) => loadMesh(e.target.files);
dropZone($('#dropMesh'), loadMesh);
$('#btnAnalyze').onclick = () => runMeshAnalysis();
$('#btnZones').onclick = () => { S.zoneColors = !S.zoneColors; showMesh(); };
function runMeshAnalysis() {
  if (!S.mesh) return;
  $('#busy').classList.add('on'); $('#busy').textContent = 'Analysing…';
  setTimeout(() => {
    try {
      const unit = $('#meshUnit').value === 'auto' ? S.mesh.unit : $('#meshUnit').value;
      const { report, geometry } = analyzeMesh(S.mesh.geo, { unit, metal: S.params.metal || '18ky', minWall: parseFloat($('#meshMinWall').value) || 0.6 });
      S.mesh.analyzed = geometry; S.meshReport = report; S.mesh.unitUsed = unit;
      showMesh(); renderMeshPanel(); fitView();
    } catch (e) { console.error(e); toast('Analysis error: ' + e.message); }
    $('#busy').classList.remove('on'); $('#busy').textContent = 'Building…';
  }, 30);
}
function showMesh() {
  if (S.mode !== 'mesh' || !S.mesh) return;
  disposeRoot();
  const g = S.mesh.analyzed || S.mesh.geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, S.zoneColors && g.attributes.color ? zoneMat : plainMat);
  mesh.userData.keepGeo = true; mesh.userData.kind = 'metal';
  root.add(mesh);
  applyMaterials();
  const box = new THREE.Box3().setFromObject(root);
  dimsBox.box.copy(box); dimsBox.visible = S.showDims;
  const s = box.getSize(new THREE.Vector3());
  $('#hud').innerHTML = `${esc(S.mesh.name)}<br>W ${f(s.x)} × H ${f(s.y)} × D ${f(s.z)} mm`;
  fitView();
}
function renderMeshPanel() {
  const r = S.meshReport;
  const rp = $('#rightPanel');
  if (!r) { rp.innerHTML = '<div class="card"><b>Mesh Lab</b><p class="muted">Load a mesh to see topology, wall thickness, weight, symmetry, ring size and the rebuild plan.</p></div>'; $('#meshPlan').innerHTML = ''; return; }
  const T = r.topology, G = r.geometry;
  rp.innerHTML = `
    <div class="card weight"><div class="big">${f(G.grams)}<small> g</small></div><div class="muted">${METALS[G.metal].label} · ${esc(G.volumeMethod)}</div>
      <div class="kv"><b>Volume</b><span>${f(G.volume, 1)} mm³</span><b>Bounding box</b><span>${G.bbox.map((x) => f(x, 1)).join(' × ')} mm</span><b>Surface area</b><span>${f(G.area / 100, 1)} cm²</span>
      ${r.ring ? `<b>Ring size</b><span>Ø ${f(r.ring.innerDiameter)} mm · US ${f(r.ring.usSize, 2)}</span>` : ''}<b>Analysed in</b><span>${f(r.ms, 0)} ms</span></div></div>
    <div class="card"><div class="card-h"><b>Topology</b><span class="score" style="color:${T.watertight ? 'var(--pass)' : 'var(--fail)'}">${T.watertight ? 'watertight' : 'open'}</span></div>
      <div class="kv"><b>Triangles</b><span>${T.triangles.toLocaleString()}</span><b>Vertices</b><span>${T.vertices.toLocaleString()}</span><b>Shells</b><span>${T.components}</span><b>Naked edges</b><span>${T.nakedEdges} (${T.holes} holes)</span><b>Non-manifold</b><span>${T.nonManifoldEdges}</span><b>Degenerate faces</b><span>${T.degenerate}</span></div></div>
    <div class="card"><div class="card-h"><b>Wall thickness</b></div><div class="kv"><b>Minimum</b><span>${f(r.thickness.min)} mm</span><b>5th percentile</b><span>${f(r.thickness.p05)} mm</span><b>Median</b><span>${f(r.thickness.median)} mm</span><b>Below ${r.thickness.minWall} mm</b><span>${f(r.thickness.thinPct, 1)}%</span></div></div>
    <div class="card"><div class="card-h"><b>Rebuild zones</b></div><div class="kv"><b>Smooth (auto)</b><span>${f(r.zones.smooth, 0)}%</span><b>Detail (manual)</b><span>${f(r.zones.detail, 0)}%</span><b>Thin</b><span>${f(r.zones.thin, 0)}%</span><b>Defects</b><span>${f(r.zones.defect, 0)}%</span><b>Symmetry RMS</b><span>${f(r.symmetry.best.rms, 3)} mm ${r.symmetry.symmetric ? '✓' : ''}</span></div></div>
    <div class="card"><div class="card-h"><b>Weight in other metals</b></div><table class="alloys">${Object.entries(G.weights).map(([k, w]) => `<tr><td>${METALS[k].label}</td><td>${f(w)} g</td></tr>`).join('')}</table></div>`;
  const plan = r.recommendations.map((x, i) => `<h4>${i + 1}. ${esc(x.title)}</h4><ul>${x.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`).join('');
  $('#meshPlan').innerHTML = `<div class="btnrow"><button id="btnMeshMd" class="primary">Download plan (.md)</button>${r.ring ? '<button id="btnMeshRing">Rebuild as parametric ring</button>' : ''}</div><div class="workflow">${plan}</div>`;
  $('#btnMeshMd').onclick = () => download(S.mesh.name.replace(/\.\w+$/, '') + '-rebuild-plan.md', reportMarkdown(r, S.mesh.name), 'text/markdown');
  if (r.ring) $('#btnMeshRing').onclick = () => { setTab('design'); S.hidden.clear(); setType('ring', { ...S.params, ringSize: Math.round(r.ring.usSize * 4) / 4, metal: S.params.metal || '18ky' }); toast(`Ring rebuilt at US ${Math.round(r.ring.usSize * 4) / 4} — now match the head and style.`); };
}

/* ============================== HISTORY / TOOLS ============================== */
const hist = { stack: [], pos: -1, lock: false };
function pushHistory() {
  if (hist.lock) return;
  const snap = JSON.stringify({ t: S.type, p: S.params });
  if (hist.stack[hist.pos] === snap) return;
  hist.stack = hist.stack.slice(0, hist.pos + 1);
  hist.stack.push(snap);
  if (hist.stack.length > 80) hist.stack.shift();
  hist.pos = hist.stack.length - 1;
}
function stepHistory(d) {
  const np = hist.pos + d;
  if (np < 0 || np >= hist.stack.length) return toast(d < 0 ? 'Nothing to undo' : 'Nothing to redo');
  hist.pos = np;
  const j = JSON.parse(hist.stack[np]);
  hist.lock = true;
  if (j.t !== S.type) setType(j.t, j.p); else { S.params = j.p; syncForm(); rebuild(); }
  hist.lock = false;
}
$('#btnUndo').onclick = () => stepHistory(-1);
$('#btnRedo').onclick = () => stepHistory(1);
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); stepHistory(e.shiftKey ? 1 : -1); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); stepHistory(1); }
});
$('#tglSpin').onclick = (e) => { controls.autoRotate = !controls.autoRotate; controls.autoRotateSpeed = 2.2; e.currentTarget.classList.toggle('on', controls.autoRotate); };
$('#fileFont').onchange = async (e) => {
  const fl = e.target.files[0]; if (!fl) return;
  try {
    const key = await registerFontFile(fl);
    if (S.type === 'name') S.params.font = key;
    else if (S.type === 'ring' && String(S.params.signetFace).startsWith('initials')) S.params.signetFont = key;
    else if (S.type === 'ring' && S.params.engraveText) S.params.engraveFont = key;
    renderForm(); rebuild(); toast(`Font “${fl.name}” added — choose it in any font menu.`);
  } catch (err) { toast('Font error: ' + err.message); }
};

/* ============================== MISC ============================== */
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }
window.addEventListener('error', (e) => console.error(e.error || e.message));

// boot: from share link, else last metal + classic solitaire
(function boot() {
  let t = 'ring', p = { metal: store.get('pjc.metal', '18ky') };
  const m = location.hash.match(/#d=(.+)/);
  if (m) { try { const j = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (SCHEMAS[j.t]) { t = j.t; p = j.p; } } catch { /* ignore */ } }
  resize();
  setType(t, p);
  setTimeout(() => fitView(), 60);
})();

/* ============================== EDIT MODE + AI EDIT BAR ============================== */
let editor = null;
editor = initEditor({ camera, canvas, scene, root, orbit: controls, getState: () => ({ type: S.type, params: S.params }), toast,
  commit: (patch, msg) => { Object.assign(S.params, patch); pushHistory(); rebuild(); if (msg) toast(msg); } });
$('#aiBar').onsubmit = (e) => {
  e.preventDefault();
  const txt = $('#aiBarInput').value.trim(); if (!txt) return;
  const r = parseEdit(txt, S.type, S.params);
  if (r.newDesign) {
    applyDesign(r.newDesign.type, r.newDesign.params, r.newDesign.notes); setTab('design');
    toast(`New ${r.newDesign.type}: ${r.newDesign.summary || 'defaults'}`);
  } else if (r.understood) {
    Object.assign(S.params, r.params);
    if (r.params.cut || r.params.gem) S.params.gemSize = '';
    renderForm(); pushHistory(); rebuild();
    toast('✓ ' + r.changes.join(' · '));
  } else if (aiSettings.ready) {
    setTab('ai');
    runAI(`EDIT the current ${S.type}: ${txt}. Keep everything else unchanged and return only the keys that change in the JSON block.`, [], { merge: true });
  } else {
    toast('Not understood offline. Try: “6 prongs”, “longer petals”, “collet setting”, “rose gold”, “thicker band”, “add spikes” — or add a Claude key in ⚙ AI.');
  }
  $('#aiBarInput').value = '';
};

initImageTab({ setType: (t, p) => { S.hidden.clear(); setType(t, { ...defaultsFor(t), metal: S.params.metal, ...p }); }, setTab, toast, md, runAI, defaultsFor, getParams: () => S.params, getType: () => S.type,
  fitView: (v) => setTimeout(() => fitView(v), 900), setRefFile: (f) => { S.refFile = f; } });

/* ============================== AUTO-FIX / MATCHING SET / STYLE MIXER ============================== */
document.addEventListener('click', (e) => { if (e.target.id === 'btnAutoFix') autoFix(); });
async function autoFix() {
  if (!S.model) return;
  const all = [];
  let p = { ...S.params };
  for (let pass = 0; pass < 3; pass++) {
    const model = generate(S.type, p, { csg: false });
    const m = measure(model, p.metal, { res: 90 });
    const v = validate(model, m, p, p.metal);
    const r = autoFixPatch(S.type, p, model.meta, v.checks);
    if (!r.fixes.length) break;
    p = { ...p, ...r.patch };
    all.push(...r.fixes);
  }
  if (!all.length) return toast('Nothing to fix — no warnings or failures that parameters can solve.');
  S.params = p; renderForm(); pushHistory(); rebuild();
  showMsg('Auto-fix applied', all.map((x) => '- ' + x).join('\n') + '\n\n_Undo with Ctrl+Z._');
  toast(`⚒ ${all.length} fix(es) applied`);
  if (S.params.targetWeight > 0) setTimeout(() => { const w = S.v?.checks.find((c) => c.title === 'Weight off target'); if (w) $('#btnOptimize').click(); }, 1500);
}
const styleNames = Object.keys(STYLE_NOTES);
['#mixA', '#mixB'].forEach((sel, i) => { $(sel).innerHTML = styleNames.map((k) => `<option value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join(''); $(sel).value = i ? 'floral' : 'gothic'; });
$('#mixT').oninput = (e) => { const t = +e.target.value; $('#mixVal').textContent = `${Math.round((1 - t) * 100)}% ${$('#mixA').value} / ${Math.round(t * 100)}% ${$('#mixB').value}`; };
$('#btnMix').onclick = () => {
  if (!STYLE_PRESETS[S.type]) return toast('Style mixing works for rings and pendants.');
  S.params = mixStyles(S.type, S.params, $('#mixA').value, $('#mixB').value, +$('#mixT').value);
  renderForm(); pushHistory(); rebuild(); toast('Mixed style applied — fine-tune any parameter.');
};

const gallery = initVariations({ getState: () => ({ type: S.type, params: S.params }), apply: (t, p) => { S.hidden.clear(); setType(t, p); }, toast, generate, metalMat, stoneMat, scene });
$('#btnSet').onclick = () => gallery.showItems(matchingSet(S.type, S.params), 'Matching set — click a piece to design it');

// expose for debugging / automation
window.PJC = { S, generate, measure, validate, setType, fitView, root, scene, camera, renderer };
