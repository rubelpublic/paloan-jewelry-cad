// Image → 3D tab: upload / paste / camera / free AI concept image / sketch pad, smart background removal with
// keep/remove brush, and conversions — including "Product photo → fully editable 3D" (detection + AI + reference overlay).
import { loadImageFile, rasterize, processImage, imageStore, analyzeImage, contourToMM } from './image3d.js';
import { resample } from './geom/util.js';
import { fileToImage, generateConceptImage, aiSettings } from './ai.js';

export function initImageTab(api) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let R = null, srcFile = null, view = 'mask', paint = null, brush = 0;   // brush: 0 off, 1 keep, -1 remove
  const canvas = $('#img3dCanvas');

  const opts = () => ({
    mode: $('#i3Mode').value,
    threshold: $('#i3Auto').checked ? null : parseFloat($('#i3Thr').value),
    invert: $('#i3Invert').checked, fillHoles: $('#i3Fill').checked, keepLargest: $('#i3Largest').checked,
    smooth: parseInt($('#i3Smooth').value, 10) || 0,
    blur: parseInt($('#i3Blur').value, 10) || 0, contrast: parseFloat($('#i3Contrast').value) || 1, heightInvert: $('#i3HInvert').checked,
    paint,
  });

  async function load(file, { quiet = false } = {}) {
    try {
      const { img, name } = await loadImageFile(file);
      srcFile = file;
      R = rasterize(img, 320);
      paint = new Int8Array(R.w * R.h);
      imageStore.name = name;
      imageStore.srcFile = file;
      ['#img3dWrap', '#img3dControls', '#img3dRelief', '#img3dActions'].forEach((s) => $(s).classList.remove('hidden'));
      process();
      if (!quiet) api.toast(`${name}: ${R.w}×${R.h} px analysed — choose what to make.`);
      const t = api.getType(), p = api.getParams();
      if (t === 'relief' || (t === 'ring' && String(p.signetFace || '').startsWith('image'))) api.setType(t, p);
    } catch (e) { api.toast('Image error: ' + e.message); }
  }

  function process() {
    if (!R) return;
    const o = opts();
    const mk = processImage(R, o);
    if (o.threshold == null) $('#i3Thr').value = mk.threshold.toFixed(2);
    $('#i3ThrVal').textContent = o.threshold == null ? `auto ${mk.threshold.toFixed(2)} (${mk.mode})` : mk.threshold.toFixed(2);
    draw();
    let cov = 0; for (const v of imageStore.mask) cov += v;
    $('#img3dInfo').innerHTML = `<p class="muted">Foreground ${(100 * cov / imageStore.mask.length).toFixed(0)}% · outline ${imageStore.contour ? imageStore.contour.length + ' pts' : 'not found'} · background: ${mk.mode}.</p>`;
  }

  function draw() {
    if (!R) return;
    canvas.width = R.w; canvas.height = R.h;
    const x = canvas.getContext('2d');
    const out = x.createImageData(R.w, R.h);
    const m = imageStore.mask, H = imageStore.height;
    for (let i = 0; i < R.w * R.h; i++) {
      const k = i * 4;
      if (view === 'orig') { out.data.set(R.rgba.subarray(k, k + 4), k); continue; }
      if (view === 'height') { const v = m[i] ? 40 + H[i] * 215 : 18; out.data[k] = out.data[k + 1] = out.data[k + 2] = v; out.data[k + 3] = 255; continue; }
      const r = R.rgba[k], g = R.rgba[k + 1], b = R.rgba[k + 2];
      if (m[i]) { out.data[k] = r * 0.45 + 217 * 0.55; out.data[k + 1] = g * 0.45 + 180 * 0.55; out.data[k + 2] = b * 0.45 + 90 * 0.55; }
      else { out.data[k] = r * 0.25; out.data[k + 1] = g * 0.25; out.data[k + 2] = b * 0.25; }
      if (paint && paint[i]) { if (paint[i] > 0) out.data[k + 1] = Math.min(255, out.data[k + 1] + 60); else out.data[k] = Math.min(255, out.data[k] + 80); }
      out.data[k + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    if (view !== 'orig' && imageStore.contour) {
      x.strokeStyle = '#6aa8ff'; x.lineWidth = Math.max(1, R.w / 220);
      x.beginPath(); imageStore.contour.forEach(([px, py], i) => (i ? x.lineTo(px + 0.5, py + 0.5) : x.moveTo(px + 0.5, py + 0.5))); x.closePath(); x.stroke();
    }
  }

  // ---------- brush refine on the preview ----------
  let painting = false, pendingProc = 0;
  const brushAt = (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * R.w, cy = ((e.clientY - r.top) / r.height) * R.h;
    const rad = (parseFloat($('#i3BrushSize').value) || 8) * (R.w / 320);
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(R.h, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(R.w, cx + rad); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) paint[y * R.w + x] = brush;
    }
    clearTimeout(pendingProc); pendingProc = setTimeout(process, 60);
  };
  canvas.addEventListener('pointerdown', (e) => { if (!brush || !R) return; painting = true; canvas.setPointerCapture(e.pointerId); brushAt(e); });
  canvas.addEventListener('pointermove', (e) => { if (painting) brushAt(e); });
  canvas.addEventListener('pointerup', () => { painting = false; });
  $$('[data-brush]').forEach((b) => b.onclick = (e) => {
    e.preventDefault();
    const v = +b.dataset.brush;
    brush = brush === v ? 0 : v;
    $$('[data-brush]').forEach((x) => x.classList.toggle('on', +x.dataset.brush === brush && brush !== 0));
    canvas.style.cursor = brush ? 'crosshair' : '';
    if (brush && view !== 'mask') { view = 'mask'; $$('[data-view3d]').forEach((x) => x.classList.toggle('on', x.dataset.view3d === 'mask')); draw(); }
  });
  $('#i3ClearPaint').onclick = (e) => { e.preventDefault(); if (paint) { paint.fill(0); process(); } };

  // ---------- inputs ----------
  $('#fileImg3d').onchange = (e) => e.target.files[0] && load(e.target.files[0]);
  const dz = $('#dropImg3d');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) load(f); });
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile(); if (!f) return;
    api.setTab('image'); load(new File([f], 'pasted-image.png', { type: f.type }));
  });
  ['#i3Mode', '#i3Smooth', '#i3Invert', '#i3Fill', '#i3Largest', '#i3Blur', '#i3Contrast', '#i3HInvert', '#i3Auto'].forEach((s) => { $(s).onchange = process; });
  $('#i3Thr').oninput = () => { $('#i3Auto').checked = false; process(); };
  $$('[data-view3d]').forEach((b) => b.onclick = (e) => { e.preventDefault(); view = b.dataset.view3d; $$('[data-view3d]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });

  // ---------- free AI concept image ----------
  $('#btnConcept').onclick = async (e) => {
    e.preventDefault();
    const prompt = $('#conceptPrompt').value.trim();
    if (!prompt) return api.toast('Describe the jewelry to generate, e.g. “gold lotus ring with a blue sapphire”.');
    const btn = $('#btnConcept'); btn.disabled = true; btn.textContent = 'Generating… (free, ~10–30 s)';
    try {
      const f = await generateConceptImage(prompt);
      await load(f, { quiet: true });
      api.toast('Concept generated — now pick “Product photo → editable 3D” or another conversion.');
    } catch (err) { api.toast(err.message); }
    btn.disabled = false; btn.textContent = '✨ Generate concept image (free)';
  };

  // ---------- sketch pad ----------
  const sk = $('#sketchPad'), sx = sk.getContext('2d');
  const clearSketch = () => { sx.fillStyle = '#fff'; sx.fillRect(0, 0, sk.width, sk.height); };
  clearSketch();
  let drawing = false, last = null;
  const pt = (e) => { const r = sk.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * sk.width, ((e.clientY - r.top) / r.height) * sk.height]; };
  sk.addEventListener('pointerdown', (e) => { drawing = true; sk.setPointerCapture(e.pointerId); last = pt(e); });
  sk.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pt(e);
    sx.strokeStyle = '#111'; sx.lineCap = 'round'; sx.lineJoin = 'round'; sx.lineWidth = parseFloat($('#sketchWidth').value) || 10;
    sx.beginPath(); sx.moveTo(...last); sx.lineTo(...p); sx.stroke(); last = p;
  });
  sk.addEventListener('pointerup', () => { drawing = false; });
  $('#sketchClear').onclick = (e) => { e.preventDefault(); clearSketch(); };
  $('#sketchUse').onclick = async (e) => {
    e.preventDefault();
    const blob = await new Promise((r) => sk.toBlob(r, 'image/png'));
    $('#i3Mode').value = 'luma'; $('#i3Fill').checked = true; $('#i3Largest').checked = true;
    await load(new File([blob], 'sketch.png', { type: 'image/png' }), { quiet: true });
    api.toast('Sketch loaded — closed outlines are filled. Convert it to a silhouette pendant or relief.');
  };

  // ---------- conversions ----------
  const width = () => Math.max(5, Math.min(70, parseFloat($('#i3Width').value) || 22));
  function overlay() {
    if (!srcFile) return;
    const img = $('#refOverlay');
    img.src = URL.createObjectURL(srcFile); img.style.display = 'block'; img.style.opacity = $('#refOpacity').value;
    api.setRefFile?.(srcFile);
  }
  async function photoTo3D() {
    const a = analyzeImage(R, imageStore.maskInfo);
    if (!a.ok) { $('#img3dInfo').innerHTML = api.md(a.notes.map((n) => '- ' + n).join('\n')); return; }
    const params = { ...a.params };
    if (a.type === 'pendant' && imageStore.contour) {
      const c = contourToMM(imageStore.contour, params.width || 20);
      params.customOutline = resample(c.outline, 220); params.height = +c.heightMM.toFixed(1);
    }
    $('#img3dInfo').innerHTML = api.md(`**Detected: ${a.type}**\n\n${a.notes.map((n) => '- ' + n).join('\n')}`);
    api.setType(a.type, params);
    overlay();
    api.fitView?.('front');
    if (aiSettings.ready && $('#i3UseAI').checked) {
      api.setTab('ai');
      const images = aiSettings.vision ? [await fileToImage(srcFile)] : [];
      api.runAI(`PRODUCT PHOTO → EDITABLE 3D. Read this jewelry product photo as precisely as possible: type, style, every component (shank profile and width, head/setting type, prong count, stone cut/colour/size in mm, halo, side stones, petals/leaves, spikes, openwork, texture, metal colour). The app already built a first guess (CURRENT DESIGN) from pixel analysis${images.length ? '' : ' (the IMAGE ANALYSIS below is all you can see)'}; correct it and return ONLY the parameters that should change in the JSON block so the 3D model matches the photo.`,
        images, { merge: true, imageNotes: a.notes.join('\n') + `\nMetrics: aspect ${a.metrics.aspect.toFixed(2)}, holes ${a.metrics.holes.count}, spikes ${a.metrics.spikes}, stone ${a.metrics.stone ? JSON.stringify(a.metrics.stone) : 'none'}` });
    } else api.toast('Editable 3D built from the photo (front view with the photo overlaid). Refine any parameter, use ✥ Edit, or the ✨ AI bar.');
  }
  $$('[data-conv]').forEach((b) => b.onclick = async () => {
    if (!R) return api.toast('Load an image first.');
    const kind = b.dataset.conv;
    if (kind === 'photo3d') return photoTo3D();
    if (kind === 'relief') {
      api.setType('relief', { shape: 'image', width: width(), lockAspect: true, mode: 'emboss', depth: 0.7, base: 1.2, rim: 0, bail: 'loop', res: 160 });
      api.toast('Relief built from the image shading — tune depth, base and border on the Design tab.');
    } else if (kind === 'coin') {
      api.setType('relief', { shape: 'circle', width: width(), lockAspect: true, mode: 'emboss', depth: 0.6, base: 1.4, rim: 1.2, rimHeight: 0.9, bail: 'loop', res: 170 });
    } else if (kind === 'silhouette') {
      if (!imageStore.contour) return api.toast('No outline found — adjust the background settings or use the brush.');
      const c = contourToMM(imageStore.contour, width());
      api.setType('pendant', { shape: 'custom', customOutline: resample(c.outline, 220), width: width(), height: +c.heightMM.toFixed(1), headType: 'none', bail: 'loop', thickness: 1.6 });
      api.toast('Silhouette pendant created — add a stone, openwork, spikes or hollowing on the Design tab.');
    } else if (kind === 'signet') {
      api.setType('ring', { shankStyle: 'signet', signetFace: 'image-engrave', signetShape: 'oval', signetW: 12, signetL: 10, signetT: 1.8, faceDepth: 0.5, widthTop: 6, widthBottom: 3.2, thickTop: 2.2, thickBottom: 1.8, profile: 'comfort', headType: 'none', style: 'classic' });
      api.toast('Signet ring with your image engraved — switch Face to “Image relief” for a raised design.');
    } else if (kind === 'ai') {
      api.setTab('ai');
      const im = await fileToImage(srcFile);
      const a = analyzeImage(R, imageStore.maskInfo);
      api.runAI('IMAGE → 3D. Identify this jewelry (type, style, construction, metal, stones with estimated mm sizes), explain how to build it as manufacturable NURBS CAD, and return the closest buildable parameters. If it is a motif/logo rather than a jewelry piece, propose the best jewelry product for it (relief pendant, signet face, name piece) with dimensions.', [im], { imageNotes: a.ok ? a.notes.join('\n') : '' });
    }
  });
}
