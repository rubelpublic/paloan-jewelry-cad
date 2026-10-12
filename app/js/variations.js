// Design variations: six manufacturable mutations of the current piece, rendered as thumbnails.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { merge } from './geom/util.js';
import { STYLE_PRESETS } from './presets.js';
import { SCHEMAS } from './schema.js';
import { getFont } from './fonts.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function mutate(type, base, r) {
  const keep = { metal: base.metal, finish: base.finish, ringSize: base.ringSize, targetWeight: 0 };
  const style = pick(r, Object.keys(STYLE_PRESETS[type] || { classic: 1 }));
  const p = { ...structuredClone(SCHEMAS[type].defaults), ...(STYLE_PRESETS[type]?.[style] || {}), ...keep, style };
  const label = [style];
  if (type === 'ring') {
    if (r() < 0.75 && p.headType !== 'none') {
      p.cut = pick(r, ['round', 'oval', 'cushion', 'pear', 'emerald', 'marquise', 'princess', 'radiant']);
      p.carat = +(0.5 + r() * 1.5).toFixed(2);
      p.headType = pick(r, ['prong', 'prong', 'halo', 'bezel']);
      p.prongCount = ['pear', 'heart'].includes(p.cut) ? 5 : p.cut === 'marquise' ? 6 : pick(r, [4, 6]);
      if (r() < 0.25 && p.headType !== 'halo') { p.sideStones = 'three-stone'; p.sideCut = pick(r, ['round', 'pear', 'emerald']); p.sideRatio = 0.55; label.push('three-stone'); }
      label.push(`${p.carat} ct ${p.cut}`, p.headType);
    }
    if (r() < 0.25) { p.accentMode = pick(r, ['half-eternity', 'shoulders']); p.accentCount = 5; p.accentSize = 1.2; label.push(p.accentMode); }
    if (r() < 0.2 && style !== 'gothic') { p.shankStyle = pick(r, ['split', 'bypass', 'twisted']); label.push(p.shankStyle); }
    if (r() < 0.15) { p.cathedral = true; label.push('cathedral'); }
  } else if (type === 'pendant') {
    p.shape = pick(r, ['teardrop', 'oval', 'circle', 'heart', 'shield', 'cushion', 'hexagon', 'gothic-cross', 'star']);
    p.headType = pick(r, ['bezel', 'prong', 'halo', 'none']);
    if (r() < 0.35) p.openwork = pick(r, ['circle', 'hex', 'quatrefoil', 'arch']);
    label.push(p.shape, p.headType !== 'none' ? p.headType : 'plain', p.openwork !== 'none' ? p.openwork : '');
  } else if (type === 'earring') {
    p.earType = pick(r, ['stud', 'hoop', 'drop']); p.headType = pick(r, ['prong', 'bezel', 'halo']);
    p.texture = r() < 0.4 ? 'hammered' : 'none';
    label.push(p.earType, p.headType);
  } else if (type === 'bangle') {
    p.texture = pick(r, ['none', 'hammered', 'organic', 'ridged']); p.cuffGap = r() < 0.4 ? 25 : 0; p.width = +(4 + r() * 8).toFixed(1); p.profile = pick(r, ['comfort', 'dome', 'flat', 'knife']);
    if (r() < 0.2) { p.spikes = 20; }
    label.push(p.texture, p.cuffGap ? 'cuff' : 'closed', p.profile);
  } else if (type === 'chain') {
    p.linkType = pick(r, ['cable', 'rolo', 'curb', 'figaro']); p.wireDia = +(0.5 + r() * 0.8).toFixed(2);
    label.push(p.linkType, `${p.wireDia} mm wire`);
  } else if (type === 'relief') {
    Object.assign(p, base, { shape: pick(r, ['image', 'circle', 'octagon', 'shield', 'cushion']), mode: pick(r, ['emboss', 'emboss', 'engrave']), rim: r() < 0.5 ? 1.2 : 0, depth: +(0.4 + r() * 0.8).toFixed(2), res: 110 });
    label.length = 0; label.push(p.shape, p.mode, p.rim ? 'border' : '');
  } else if (type === 'name') {
    const loaded = ['pacifico', 'dancing', 'greatvibes', 'cinzel', 'helvetiker', 'gentilis', 'optimer', 'allura', 'parisienne', 'droidserif'].filter((k) => getFont(k));
    Object.assign(p, { text: base.text, font: loaded.length ? pick(r, loaded) : base.font, bar: pick(r, ['none', 'underline', 'plate']), letterHeight: base.letterHeight });
    if (!['pacifico', 'dancing'].includes(p.font) && p.bar === 'none') p.bar = 'underline';
    label.length = 0; label.push(p.font, p.bar);
  }
  return { params: p, label: label.filter(Boolean).join(' · ') };
}

export function initVariations({ getState, apply, toast, generate, metalMat, stoneMat }) {
  const dlg = document.querySelector('#dlgVariations'), grid = document.querySelector('#varGrid');
  let renderer = null, scene = null, cam = null, seed = Date.now();
  function setup() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setSize(300, 300); renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x15171c);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.6));
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
  }
  function shot(model, params) {
    const g = new THREE.Group();
    for (const part of model.parts) {
      const geo = part.pieces.length === 1 ? part.pieces[0] : merge(part.pieces, 0.6);
      if (geo) g.add(new THREE.Mesh(geo, part.kind === 'stone' ? stoneMat(part.gem) : metalMat(part.metal || params.metal, params.finish)));
    }
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length() * 1.45 + 2;
    cam.position.copy(c).add(new THREE.Vector3(0.55, 0.42, 0.9).normalize().multiplyScalar(d)); cam.lookAt(c); cam.near = d / 100; cam.far = d * 10; cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
    scene.remove(g);
    return url;
  }
  async function fill() {
    setup();
    const { type, params } = getState();
    grid.innerHTML = '';
    const r = rng(seed++);
    for (let i = 0; i < 6; i++) {
      const v = mutate(type, params, r);
      const fig = document.createElement('figure');
      fig.innerHTML = '<img alt="" /><figcaption>building…</figcaption>';
      grid.appendChild(fig);
      await new Promise((res) => setTimeout(res, 10));
      try {
        const model = generate(type, v.params, { csg: false });
        fig.querySelector('img').src = shot(model, v.params);
        fig.querySelector('figcaption').textContent = v.label;
        fig.onclick = () => { dlg.close(); apply(type, v.params); toast('Variation applied — undo (Ctrl+Z) to go back.'); };
      } catch (e) { fig.querySelector('figcaption').textContent = 'failed: ' + e.message; }
    }
  }
  document.querySelector('#btnVariations').onclick = () => { dlg.showModal(); fill(); };
  document.querySelector('#btnMoreVar').onclick = () => fill();
}
