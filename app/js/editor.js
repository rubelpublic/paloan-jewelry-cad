// Edit mode (gumball): click any part in the viewport, then move / rotate / scale, polar-array, mirror, hide or reset it.
// Edits are stored in params.edits[partName] so they survive rebuilds, undo/redo, project files and exports.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export function initEditor({ camera, canvas, scene, root, orbit, getState, commit, toast }) {
  const $ = (s) => document.querySelector(s);
  const tc = new TransformControls(camera, canvas);
  const helper = tc.getHelper ? tc.getHelper() : tc;
  scene.add(helper);
  tc.setSize(0.8);
  const pivot = new THREE.Object3D();
  scene.add(pivot);
  let active = false, selected = null, startInv = new THREE.Matrix4(), baseMatrix = new THREE.Matrix4(), meshStart = new THREE.Matrix4();
  const panel = $('#editPanel');

  tc.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (e.value) { startInv.copy(pivot.matrixWorld).invert(); meshStart.copy(selected?.matrix || new THREE.Matrix4()); }
    else if (selected) {
      const delta = new THREE.Matrix4().multiplyMatrices(pivot.matrixWorld, startInv);
      const { params } = getState();
      const edits = structuredClone(params.edits || {});
      const e0 = edits[selected.name] || {};
      const prev = e0.m ? new THREE.Matrix4().fromArray(e0.m) : new THREE.Matrix4();
      e0.m = delta.multiply(prev).toArray().map((v) => Math.round(v * 1e5) / 1e5);
      edits[selected.name] = e0;
      commit({ edits }, `Edited ${selected.name}`);
    }
  });
  tc.addEventListener('objectChange', () => {
    if (!selected) return;
    const delta = new THREE.Matrix4().multiplyMatrices(pivot.matrixWorld, startInv);
    selected.matrixAutoUpdate = false;
    selected.matrix.copy(delta).multiply(meshStart);
    selected.matrixWorldNeedsUpdate = true;
  });

  function select(mesh) {
    selected = mesh;
    if (!mesh) { tc.detach(); panel.classList.add('hidden'); return; }
    const box = new THREE.Box3().setFromObject(mesh);
    box.getCenter(pivot.position);
    pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld(true);
    tc.attach(pivot);
    const e = (getState().params.edits || {})[mesh.name] || {};
    $('#epName').textContent = mesh.name;
    $('#epArray').value = e.array || 1;
    $('#epMirror').checked = !!e.mirror;
    panel.classList.remove('hidden');
  }
  // re-select by name after rebuilds
  function reselect() {
    if (!active || !selected) return;
    const m = root.children.find((c) => c.name === selected.name);
    if (m) select(m); else select(null);
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!active || !down || tc.dragging) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(root.children.filter((c) => c.visible), false)[0];
    select(hit ? hit.object : null);
  });

  function setActive(on) {
    active = on;
    $('#tglEdit').classList.toggle('on', on);
    if (!on) select(null);
    toast(on ? 'Edit mode: click a part, then drag the gumball (W move · E rotate · R scale).' : 'Edit mode off');
  }
  $('#tglEdit').onclick = () => setActive(!active);
  const mode = (m) => { tc.setMode(m); document.querySelectorAll('[data-tmode]').forEach((b) => b.classList.toggle('on', b.dataset.tmode === m)); };
  document.querySelectorAll('[data-tmode]').forEach((b) => b.onclick = () => mode(b.dataset.tmode));
  window.addEventListener('keydown', (e) => {
    if (!active || e.target.matches('input, textarea, select')) return;
    if (e.key === 'w') mode('translate'); if (e.key === 'e') mode('rotate'); if (e.key === 'r') mode('scale');
    if (e.key === 'Escape') select(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) $('#epHide').click();
  });
  const patch = (fn, msg) => {
    if (!selected) return;
    const { params } = getState();
    const edits = structuredClone(params.edits || {});
    edits[selected.name] = fn(edits[selected.name] || {});
    if (!Object.keys(edits[selected.name]).length) delete edits[selected.name];
    commit({ edits }, msg);
  };
  $('#epArray').onchange = (e) => patch((x) => ({ ...x, array: Math.max(1, Math.min(36, parseInt(e.target.value, 10) || 1)) }), 'Polar array');
  $('#epMirror').onchange = (e) => patch((x) => ({ ...x, mirror: e.target.checked }), 'Mirror');
  $('#epHide').onclick = () => { patch((x) => ({ ...x, hidden: true }), `Removed ${selected.name}`); select(null); };
  $('#epReset').onclick = () => patch(() => ({}), 'Reset part');
  $('#epResetAll').onclick = () => { commit({ edits: {} }, 'All manual edits cleared'); select(null); };
  $('#epDone').onclick = () => setActive(false);
  return { reselect, isActive: () => active, selectedName: () => selected?.name || null };
}

/** Apply stored edits to a freshly built model (called by the engine before booleans). */
export function applyEdits(model, edits, type) {
  if (!edits || !Object.keys(edits).length) return;
  const axis = type === 'ring' || type === 'chain' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const out = [];
  let count = 0;
  for (const part of model.parts) {
    const e = edits[part.name];
    if (!e) { out.push(part); continue; }
    count++;
    if (e.hidden) continue;
    let pieces = part.pieces;
    if (e.m) {
      const M = new THREE.Matrix4().fromArray(e.m);
      pieces = pieces.map((g) => g.clone().applyMatrix4(M));
      if (part.name === 'Center stone') model.cutters.filter((c) => c.type === 'seat').slice(0, 1).forEach((c) => { c.geometry = c.geometry.clone().applyMatrix4(M); });
    }
    if (e.mirror) {
      const Mx = new THREE.Matrix4().makeScale(-1, 1, 1);
      pieces = pieces.concat(pieces.map((g) => { const h = g.clone().applyMatrix4(Mx); flip(h); return h; }));
    }
    if (e.array > 1) {
      const base = pieces;
      for (let k = 1; k < e.array; k++) {
        const R = new THREE.Matrix4().makeRotationAxis(axis, (k / e.array) * Math.PI * 2);
        pieces = pieces.concat(base.map((g) => g.clone().applyMatrix4(R)));
      }
    }
    out.push({ ...part, pieces, edited: true });
  }
  model.parts = out;
  model.meta.manualEdits = count;
}
function flip(g) {
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  else { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } }
  g.computeVertexNormals();
}
