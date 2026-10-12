// Image → 3D tab: upload / paste / camera, background removal preview, conversions to jewelry.
import { loadImageFile, rasterize, processImage, imageStore, analyzeImage, contourToMM } from './image3d.js';
import { resample } from './geom/util.js';
import { fileToImage } from './ai.js';

export function initImageTab(api) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let R = null, srcFile = null, view = 'mask';
  const canvas = $('#img3dCanvas');

  const opts = () => ({
    mode: $('#i3Mode').value,
    threshold: $('#i3Auto').checked ? null : parseFloat($('#i3Thr').value),
    invert: $('#i3Invert').checked, fillHoles: $('#i3Fill').checked, keepLargest: $('#i3Largest').checked,
    smooth: parseInt($('#i3Smooth').value, 10) || 0,
    blur: parseInt($('#i3Blur').value, 10) || 0, contrast: parseFloat($('#i3Contrast').value) || 1, heightInvert: $('#i3HInvert').checked,
  });

  async function load(file) {
    try {
      const { img, name } = await loadImageFile(file);
      srcFile = file;
      R = rasterize(img, 320);
      imageStore.name = name;
      ['#img3dWrap', '#img3dControls', '#img3dRelief', '#img3dActions'].forEach((s) => $(s).classList.remove('hidden'));
      process();
      api.toast(`${name}: ${R.w}×${R.h} px analysed — choose what to make.`);
      // live-update designs that already use the image
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
    $('#img3dInfo').innerHTML = `<p class="muted">Foreground ${(100 * cov / imageStore.mask.length).toFixed(0)}% of the image · outline ${imageStore.contour ? imageStore.contour.length + ' points' : 'not found'}.</p>`;
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
      out.data[k + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    if (view !== 'orig' && imageStore.contour) {
      x.strokeStyle = '#6aa8ff'; x.lineWidth = Math.max(1, R.w / 220);
      x.beginPath(); imageStore.contour.forEach(([px, py], i) => (i ? x.lineTo(px + 0.5, py + 0.5) : x.moveTo(px + 0.5, py + 0.5))); x.closePath(); x.stroke();
    }
  }

  // inputs
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

  // conversions
  const width = () => Math.max(5, Math.min(70, parseFloat($('#i3Width').value) || 22));
  $$('[data-conv]').forEach((b) => b.onclick = async () => {
    if (!R) return api.toast('Load an image first.');
    const kind = b.dataset.conv;
    if (kind === 'relief') {
      api.setType('relief', { shape: 'image', width: width(), lockAspect: true, mode: 'emboss', depth: 0.7, base: 1.2, rim: 0, bail: 'loop', res: 160 });
      api.toast('Relief built from the image shading — tune depth, base and border on the Design tab.');
    } else if (kind === 'coin') {
      api.setType('relief', { shape: 'circle', width: width(), lockAspect: true, mode: 'emboss', depth: 0.6, base: 1.4, rim: 1.2, rimHeight: 0.9, bail: 'loop', res: 170 });
    } else if (kind === 'silhouette') {
      if (!imageStore.contour) return api.toast('No outline found — adjust the background settings.');
      const c = contourToMM(imageStore.contour, width());
      api.setType('pendant', { shape: 'custom', customOutline: resample(c.outline, 220), width: width(), height: +c.heightMM.toFixed(1), headType: 'none', bail: 'loop', thickness: 1.6 });
      api.toast('Silhouette pendant created — add a stone, openwork, spikes or hollowing on the Design tab.');
    } else if (kind === 'signet') {
      api.setType('ring', { shankStyle: 'signet', signetFace: 'image-engrave', signetShape: 'oval', signetW: 12, signetL: 10, signetT: 1.8, faceDepth: 0.5, widthTop: 6, widthBottom: 3.2, thickTop: 2.2, thickBottom: 1.8, profile: 'comfort', headType: 'none', style: 'classic' });
      api.toast('Signet ring with your image engraved — switch Face to “Image relief” for a raised design.');
    } else if (kind === 'detect') {
      const a = analyzeImage(R, imageStore.maskInfo);
      if (!a.ok) { $('#img3dInfo').innerHTML = api.md(a.notes.map((n) => '- ' + n).join('\n')); return; }
      const params = { ...a.params };
      if (a.type === 'pendant' && imageStore.contour) {
        const c = contourToMM(imageStore.contour, params.width || 20);
        params.customOutline = resample(c.outline, 220); params.height = +c.heightMM.toFixed(1);
      }
      $('#img3dInfo').innerHTML = api.md(`**Detected: ${a.type}**\n\n${a.notes.map((n) => '- ' + n).join('\n')}\n\n_Heuristic reading — use “AI interpret” for a full engineering analysis._`);
      api.setType(a.type, params);
    } else if (kind === 'ai') {
      api.setTab('ai');
      const im = await fileToImage(srcFile);
      api.runAI('IMAGE → 3D. Identify this jewelry (type, style, construction, metal, stones with estimated mm sizes), explain how to build it as manufacturable NURBS CAD, and return the closest buildable parameters. If it is a motif/logo rather than a jewelry piece, propose the best jewelry product for it (relief pendant, signet face, name piece) with dimensions.', [im]);
    }
  });
}
