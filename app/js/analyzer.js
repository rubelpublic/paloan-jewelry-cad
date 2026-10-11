// Mesh Lab: load AI / scanned meshes, diagnose topology, thickness, symmetry, ring size,
// segment rebuild zones and produce a Mesh → NURBS reconstruction plan.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { MeshBVH } from 'three-mesh-bvh';
import { METALS, diameterToUs } from './data.js';
import { signedVolume } from './geom/util.js';
import { unionVolume } from './engine.js';

export const UNIT_SCALE = { mm: 1, cm: 10, m: 1000, in: 25.4 };

/** Read a File into a single world-space BufferGeometry (position only). */
export async function loadMeshFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const buf = await file.arrayBuffer();
  let root;
  if (ext === 'stl') return new STLLoader().parse(buf);
  if (ext === 'ply') return new PLYLoader().parse(buf);
  if (ext === 'obj') root = new OBJLoader().parse(new TextDecoder().decode(buf));
  else if (ext === 'fbx') root = new FBXLoader().parse(buf, '');
  else if (ext === 'glb' || ext === 'gltf') root = (await new GLTFLoader().parseAsync(ext === 'gltf' ? new TextDecoder().decode(buf) : buf, '')).scene;
  else throw new Error(`Unsupported format .${ext} (use STL, OBJ, GLB/GLTF, FBX or PLY)`);
  root.updateMatrixWorld(true);
  const pos = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const a = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); }
  });
  if (!pos.length) throw new Error('No mesh data found in file');
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

/** Suggest the unit the file was authored in, from its overall size. */
export function guessUnit(geo) {
  geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(new THREE.Vector3()), m = Math.max(s.x, s.y, s.z);
  if (m < 0.2) return 'm';
  if (m < 1.2) return 'in';
  if (m < 6) return 'cm';
  return 'mm';
}

const ZONE = { smooth: [0.25, 0.75, 0.45], detail: [0.95, 0.65, 0.15], thin: [0.92, 0.2, 0.2], defect: [0.62, 0.3, 0.95] };

export function analyzeMesh(rawGeo, { unit = 'mm', metal = '18ky', minWall = 0.6, maxTris = 400000 } = {}) {
  const t0 = performance.now();
  let g = rawGeo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const sc = UNIT_SCALE[unit] || 1;
  if (sc !== 1) g.scale(sc, sc, sc);
  g.computeBoundingBox();
  const bb = g.boundingBox.clone(), size = bb.getSize(new THREE.Vector3());
  const tol = Math.max(size.x, size.y, size.z) * 1e-6;
  g = mergeVertices(g, tol);
  g.computeVertexNormals();
  const P = g.attributes.position, I = g.index.array, nV = P.count, nT = I.length / 3;
  const report = { file: {}, topology: {}, geometry: {}, thickness: {}, symmetry: {}, ring: null, components: [], zones: {}, recommendations: [], warnings: [] };
  report.topology = { vertices: nV, triangles: nT };

  // ---- triangles, degenerates, face normals ----
  const fn = new Float32Array(nT * 3), fa = new Float32Array(nT);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let degenerate = 0;
  for (let t = 0; t < nT; t++) {
    a.fromBufferAttribute(P, I[t * 3]); b.fromBufferAttribute(P, I[t * 3 + 1]); c.fromBufferAttribute(P, I[t * 3 + 2]);
    const n = b.sub(a).cross(c.sub(a));
    const ar = n.length() / 2;
    fa[t] = ar;
    if (ar < tol * tol * 10) degenerate++;
    n.normalize(); fn[t * 3] = n.x; fn[t * 3 + 1] = n.y; fn[t * 3 + 2] = n.z;
  }
  // ---- edges ----
  const edges = new Map();
  const ekey = (u, v) => (u < v ? u * nV + v : v * nV + u);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const u = I[t * 3 + k], v = I[t * 3 + (k + 1) % 3], key = ekey(u, v);
    const e = edges.get(key); if (e) e.push(t); else edges.set(key, [t]);
  }
  let naked = 0, nonManifold = 0;
  const badVert = new Uint8Array(nV);
  const nakedEdges = [];
  for (const [key, tris] of edges) {
    if (tris.length === 1) { naked++; const u = Math.floor(key / nV), v = key % nV; badVert[u] = badVert[v] = 1; nakedEdges.push([u, v]); }
    else if (tris.length > 2) { nonManifold++; const u = Math.floor(key / nV), v = key % nV; badVert[u] = badVert[v] = 2; }
  }
  // boundary loops (holes)
  const adj = new Map();
  for (const [u, v] of nakedEdges) { (adj.get(u) || adj.set(u, []).get(u)).push(v); (adj.get(v) || adj.set(v, []).get(v)).push(u); }
  const seen = new Set(); let holes = 0;
  for (const s of adj.keys()) { if (seen.has(s)) continue; holes++; const st = [s]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const y of adj.get(x)) if (!seen.has(y)) st.push(y); } }
  Object.assign(report.topology, { edges: edges.size, nakedEdges: naked, nonManifoldEdges: nonManifold, holes, degenerate, watertight: naked === 0 && nonManifold === 0 });

  // ---- components (union-find over vertices) ----
  const parent = new Int32Array(nV).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < nT; t++) { const r0 = find(I[t * 3]); for (let k = 1; k < 3; k++) { const r = find(I[t * 3 + k]); if (r !== r0) parent[r] = r0; } }
  const compTris = new Map();
  for (let t = 0; t < nT; t++) { const r = find(I[t * 3]); (compTris.get(r) || compTris.set(r, []).get(r)).push(t); }
  const comps = [...compTris.values()].sort((x, y) => y.length - x.length);
  const compGeos = [];
  let totalVol = 0, area = 0;
  for (let t = 0; t < nT; t++) area += fa[t];
  comps.forEach((tris, ci) => {
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, k) => { for (let j = 0; j < 3; j++) { const vi = I[t * 3 + j]; pos[k * 9 + j * 3] = P.getX(vi); pos[k * 9 + j * 3 + 1] = P.getY(vi); pos[k * 9 + j * 3 + 2] = P.getZ(vi); } });
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const vol = signedVolume(cg); totalVol += vol;
    cg.computeBoundingBox();
    const cs = cg.boundingBox.getSize(new THREE.Vector3());
    let convexity = null;
    if (ci < 60 && tris.length < 60000) {
      try {
        const pts = []; for (let i = 0; i < pos.length; i += 9 * Math.max(1, Math.floor(tris.length / 4000))) pts.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
        if (pts.length > 8) { const hull = new ConvexGeometry(pts); convexity = Math.abs(vol) / Math.max(1e-9, Math.abs(signedVolume(hull))); }
      } catch { /* hull failed */ }
    }
    compGeos.push(cg);
    if (ci < 200) report.components.push({ id: ci + 1, triangles: tris.length, volume: Math.abs(vol), size: [cs.x, cs.y, cs.z], convexity });
  });
  report.topology.components = comps.length;
  // likely gems: small convex shells
  const maxDim = Math.max(size.x, size.y, size.z);
  report.components.forEach((cp) => { cp.role = cp.convexity > 0.9 && Math.max(...cp.size) < maxDim * 0.45 && Math.max(...cp.size) / Math.max(1e-6, Math.min(...cp.size)) < 2.2 && comps.length > 1 ? 'gem / bead candidate' : cp.id === 1 ? 'main body' : Math.max(...cp.size) < maxDim * 0.06 ? 'debris / floating fragment' : 'part'; });

  // ---- geometry / weight ----
  let vol = Math.abs(totalVol), volMethod = 'signed volume (closed)';
  if (!report.topology.watertight) {
    try { vol = unionVolume(compGeos, 160); volMethod = 'ray-parity estimate (mesh is open — treat as approximate)'; } catch { /* keep */ }
  }
  const metalD = METALS[metal] || METALS['18ky'];
  report.geometry = { bbox: [size.x, size.y, size.z], area, volume: vol, volumeMethod: volMethod, grams: (vol * metalD.density) / 1000, metal };
  report.geometry.weights = Object.fromEntries(Object.entries(METALS).map(([k, m]) => [k, (vol * m.density) / 1000]));

  // ---- BVH for thickness / symmetry ----
  const bvhGeo = g.clone();                         // MeshBVH reorders the index in place — keep g's triangle order intact
  const bvh = new MeshBVH(bvhGeo);
  const BI = bvhGeo.index.array;
  const N = g.attributes.normal;
  const step = Math.max(1, Math.floor(nV / 7000));
  const thick = new Float32Array(nV).fill(NaN);
  const ray = new THREE.Ray(), o = new THREE.Vector3(), d = new THREE.Vector3();
  let thin = 0, sampled = 0, minT = Infinity;
  const tvals = [];
  for (let i = 0; i < nV; i += step) {
    o.fromBufferAttribute(P, i); d.fromBufferAttribute(N, i).negate();
    if (d.lengthSq() < 0.5) continue;
    ray.origin.copy(o).addScaledVector(d, tol * 20 + 1e-4); ray.direction.copy(d);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    if (!hit) continue;
    if (find(BI[hit.faceIndex * 3]) !== find(i)) continue;   // ray hit an overlapping separate shell, not this wall
    const tt = hit.distance;
    thick[i] = tt; sampled++; tvals.push(tt);
    if (tt < minWall) thin++;
    minT = Math.min(minT, tt);
  }
  tvals.sort((x, y) => x - y);
  report.thickness = { sampled, minWall, thinSamples: thin, thinPct: sampled ? (thin / sampled) * 100 : 0, min: minT, p05: tvals[Math.floor(tvals.length * 0.05)] || NaN, median: tvals[Math.floor(tvals.length / 2)] || NaN };

  // ---- curvature (normal deviation) ----
  const vf = new Float32Array(nV), vc = new Uint16Array(nV);
  const vn = new THREE.Vector3();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const vi = I[t * 3 + k]; vn.fromBufferAttribute(N, vi);
    vf[vi] += 1 - (vn.x * fn[t * 3] + vn.y * fn[t * 3 + 1] + vn.z * fn[t * 3 + 2]); vc[vi]++;
  }
  // ---- zone classification per vertex (spread thickness to unsampled vertices via nearest sampled in index order) ----
  const colors = new Float32Array(nV * 3);
  const counts = { smooth: 0, detail: 0, thin: 0, defect: 0 };
  let lastT = NaN;
  for (let i = 0; i < nV; i++) {
    if (!Number.isNaN(thick[i])) lastT = thick[i];
    const curv = vc[i] ? vf[i] / vc[i] : 0;
    let z = 'smooth';
    if (badVert[i]) z = 'defect';
    else if (lastT < minWall) z = 'thin';
    else if (curv > 0.035) z = 'detail';
    counts[z]++;
    colors.set(ZONE[z], i * 3);
  }
  const zonePct = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / nV) * 100]));
  report.zones = zonePct;
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // ---- PCA axes ----
  const cen = new THREE.Vector3();
  for (let i = 0; i < nV; i++) cen.add(o.fromBufferAttribute(P, i));
  cen.multiplyScalar(1 / nV);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < nV; i += step) { o.fromBufferAttribute(P, i).sub(cen); const v = [o.x, o.y, o.z]; for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[r][s] += v[r] * v[s]; }
  const axes = jacobiEigen(C); // sorted by eigenvalue desc
  // ---- symmetry ----
  const sym = [];
  const target = { point: new THREE.Vector3(), distance: 0 };
  for (const ax of axes) {
    const nrm = new THREE.Vector3(...ax.vec).normalize();
    let sum = 0, cnt = 0;
    for (let i = 0; i < nV; i += step * 2) {
      o.fromBufferAttribute(P, i);
      const dist = o.clone().sub(cen).dot(nrm);
      const m = o.clone().addScaledVector(nrm, -2 * dist);
      bvh.closestPointToPoint(m, target);
      sum += target.distance * target.distance; cnt++;
    }
    sym.push({ axis: ax.vec.map((x) => +x.toFixed(3)), rms: Math.sqrt(sum / Math.max(1, cnt)) });
  }
  sym.sort((x, y) => x.rms - y.rms);
  report.symmetry = { planes: sym, best: sym[0], symmetric: sym[0].rms < maxDim * 0.01 };

  // ---- ring detection: finger hole around a principal axis, centre refined by circle fitting ----
  for (const ax of [axes[2], axes[1], axes[0]]) {
    const A = new THREE.Vector3(...ax.vec).normalize();
    const u = new THREE.Vector3().crossVectors(A, Math.abs(A.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(A, u);
    let c0 = bb.getCenter(new THREE.Vector3());
    let ds = [], ok = false;
    for (let iter = 0; iter < 5; iter++) {
      const pts = [];
      ds = [];
      for (let k = 0; k < 72; k++) {
        const ang = (k / 72) * 2 * Math.PI;
        ray.origin.copy(c0); ray.direction.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
        const h = bvh.raycastFirst(ray, THREE.DoubleSide);
        if (h) { ds.push(h.distance); pts.push([h.point.clone().sub(c0).dot(u), h.point.clone().sub(c0).dot(v)]); }
      }
      if (pts.length < 66) break;
      // Kåsa least-squares circle fit in the (u, v) plane
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
      for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
      const n = pts.length;
      const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], R = [sxz, syz, sz];
      const sol = solve3(M, R);
      if (!sol) break;
      const cx = sol[0] / 2, cy = sol[1] / 2;
      c0 = c0.clone().addScaledVector(u, cx).addScaledVector(v, cy);
      ok = true;
      if (Math.hypot(cx, cy) < 0.005) break;
    }
    if (!ok || ds.length < 66) continue;
    ds.sort((x, y) => x - y);
    const r = ds[Math.floor(ds.length * 0.5)];
    if (r > 6 && r < 12) {
      report.ring = { innerDiameter: 2 * r, usSize: diameterToUs(2 * r), axis: ax.vec.map((x) => +x.toFixed(3)), roundness: ds[Math.floor(ds.length * 0.9)] / ds[Math.floor(ds.length * 0.1)] };
      break;
    }
  }
  report.recommendations = recommend(report);
  report.ms = performance.now() - t0;
  return { report, geometry: g };
}

function recommend(r) {
  const R = [];
  const T = r.topology, Z = r.zones;
  const push = (priority, title, steps) => R.push({ priority, title, steps });
  if (T.triangles > 600000) push(1, 'Decimate before anything else', [`Mesh has ${T.triangles.toLocaleString()} triangles. Run ReduceMesh to ~150–250k (keep "Normal smoothing" off).`, 'Save a copy of the original mesh on a locked "Reference" layer.']);
  if (!T.watertight) push(1, 'Repair topology', [
    `${T.nakedEdges} naked edges in ${T.holes} hole loops${T.nonManifoldEdges ? `, ${T.nonManifoldEdges} non-manifold edges` : ''}.`,
    'Rhino: MeshRepair → Check → fix in order: ExtractNonManifoldMeshEdges, DeleteMeshFaces on fragments, FillMeshHoles, UnifyMeshNormals, Weld (angle 180).',
    'Do not convert a broken mesh straight to NURBS (MeshToNURBS) — it creates millions of faces and naked edges.']);
  if (T.components > 1) {
    const debris = r.components.filter((c) => c.role.startsWith('debris')).length;
    push(2, 'Segment the mesh by component', [
      `${T.components} disconnected shells. ${debris} look like debris (delete with SelMeshDisjoint/ExtractConnectedMeshFaces).`,
      'ExplodeMesh / SplitDisjointMesh, then place each shell on its own layer: Body, Head, Stones, Ornament.']);
  }
  const gems = r.components.filter((c) => c.role.startsWith('gem'));
  if (gems.length) push(2, 'Replace mesh gems with real gem objects', [
    `${gems.length} convex shells look like stones/beads (sizes ${gems.slice(0, 5).map((g) => Math.max(...g.size).toFixed(2) + ' mm').join(', ')}${gems.length > 5 ? '…' : ''}).`,
    'Delete them and place true gems (MatrixGold Gem Studio / Paloan stone cutter) at the same centres, snapped to standard calibrated sizes.',
    'Never cast or price from mesh stones — they are not faceted to proportion.']);
  if (Z.smooth > 35) push(3, 'Body: QuadRemesh → SubD → NURBS', [
    `${Z.smooth.toFixed(0)}% of the surface is smooth/flowing — ideal for automated reconstruction.`,
    'QuadRemesh: Target edge length ≈ 0.4–0.8 mm, Adaptive size 50, "Detect hard edges" on, Symmetry if the piece is symmetric.',
    'ToSubD (Crease detected edges), refine with SubD gumball edits, then ToNURBS → solid polysurface. Check with ShowEdges (naked) and Check.']);
  if (Z.detail > 5) push(2, 'Rebuild detail zones manually', [
    `${Z.detail.toFixed(0)}% high-curvature detail (prongs, spikes, carvings, filigree, coils).`,
    'Prongs/claws: draw centre curves → Pipe (variable radius) → cap tips with spheres; seat with BooleanDifference against the gem cutter.',
    'Spikes: Revolve a profile or Cone from a surface-normal base point; base Ø ≥ 1.0 mm.',
    'Carvings/relief: build a clean base surface, then use Displacement or MatrixGold "Texture" from a height-map baked from the mesh; or sculpt in SubD.',
    'Filigree/coils: trace curves on the surface (Project / CurveOnSurface), Pipe 0.6–0.8 mm, Boolean union in batches.']);
  if (r.thickness.thinPct > 2) push(1, 'Thicken weak geometry', [
    `${r.thickness.thinPct.toFixed(1)}% of sampled walls are below ${r.thickness.minWall} mm (min found ${r.thickness.min.toFixed(2)} mm).`,
    'Offset those surfaces (OffsetSrf solid) or rebuild them at ≥ 0.6 mm (gold) / 0.8 mm (silver). Thin AI-generated wisps never cast.']);
  if (r.symmetry.symmetric) push(3, 'Use symmetry', [`Mirror plane found (RMS deviation ${r.symmetry.best.rms.toFixed(3)} mm). Rebuild one half, then Mirror and Join — halves the work and guarantees symmetry.`]);
  else push(4, 'Symmetry', [`No clean mirror plane (best RMS ${r.symmetry.best.rms.toFixed(2)} mm). If the design is meant to be symmetric, rebuild one side and mirror.`]);
  if (r.ring) push(2, 'Ring sizing', [`Finger hole ≈ Ø ${r.ring.innerDiameter.toFixed(2)} mm → US ${r.ring.usSize.toFixed(2)}.`, 'Rebuild the shank parametrically (Paloan Ring generator → Rhino script) on a true circle at the target size; snap the head to it.', r.ring.roundness > 1.08 ? `Hole is out of round (${((r.ring.roundness - 1) * 100).toFixed(0)}%) — AI meshes usually are; do not reuse the mesh shank.` : 'Hole is round.']);
  push(5, 'Final checks before production', ['Join → Check → ShowEdges (no naked/non-manifold edges)', 'VolumeCentroid / Volume for weight; compare with the Paloan weight estimate', 'Layer hierarchy: Metal::Shank, Metal::Head, Stones, Cutters (hidden), Reference (locked)', 'Export STL for print at 0.01 mm tolerance; keep the .3dm editable (no merged mesh).']);
  return R.sort((a, b) => a.priority - b.priority);
}

function solve3(M, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-12) return null;
  return [0, 1, 2].map((k) => det(M.map((row, i) => row.map((x, j) => (j === k ? b[i] : x)))) / D);
}

/** Symmetric 3×3 eigen decomposition (Jacobi). Returns [{val, vec}] sorted descending. */
function jacobiEigen(A) {
  const a = A.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0; for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = cs * vkp - sn * vkq; v[k][q] = sn * vkp + cs * vkq; }
    }
  }
  return [0, 1, 2].map((i) => ({ val: a[i][i], vec: [v[0][i], v[1][i], v[2][i]] })).sort((x, y) => y.val - x.val);
}

export function reportMarkdown(r, name = 'mesh') {
  const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
  const L = [];
  L.push(`# Paloan Mesh → CAD report: ${name}`, '');
  L.push(`**Bounding box:** ${r.geometry.bbox.map((x) => f(x)).join(' × ')} mm  `);
  L.push(`**Triangles:** ${r.topology.triangles.toLocaleString()} · **Shells:** ${r.topology.components} · **Watertight:** ${r.topology.watertight ? 'yes' : 'no'}  `);
  L.push(`**Naked edges:** ${r.topology.nakedEdges} (${r.topology.holes} holes) · **Non-manifold edges:** ${r.topology.nonManifoldEdges} · **Degenerate faces:** ${r.topology.degenerate}  `);
  L.push(`**Volume:** ${f(r.geometry.volume, 1)} mm³ (${r.geometry.volumeMethod})  `);
  L.push(`**Weight:** ${Object.entries(r.geometry.weights).map(([k, v]) => `${k} ${f(v)} g`).join(' · ')}`, '');
  L.push(`**Wall thickness:** min ${f(r.thickness.min)} mm · 5th pct ${f(r.thickness.p05)} mm · median ${f(r.thickness.median)} mm · ${f(r.thickness.thinPct, 1)}% below ${r.thickness.minWall} mm`, '');
  L.push(`**Zones:** smooth ${f(r.zones.smooth, 0)}% · detail ${f(r.zones.detail, 0)}% · thin ${f(r.zones.thin, 0)}% · defect ${f(r.zones.defect, 0)}%`, '');
  if (r.ring) L.push(`**Ring detected:** inner Ø ${f(r.ring.innerDiameter)} mm → US ${f(r.ring.usSize, 2)}`, '');
  L.push(`**Symmetry:** best plane normal [${r.symmetry.best.axis.join(', ')}], RMS ${f(r.symmetry.best.rms, 3)} mm`, '');
  L.push('## Rebuild plan (priority order)', '');
  r.recommendations.forEach((x, i) => { L.push(`### ${i + 1}. ${x.title}`); x.steps.forEach((s) => L.push(`- ${s}`)); L.push(''); });
  L.push('## Components', '', '| # | triangles | volume mm³ | size mm | convexity | role |', '|---|---|---|---|---|---|');
  r.components.slice(0, 40).forEach((c) => L.push(`| ${c.id} | ${c.triangles} | ${f(c.volume, 1)} | ${c.size.map((x) => f(x, 1)).join('×')} | ${c.convexity == null ? '—' : f(c.convexity)} | ${c.role} |`));
  return L.join('\n');
}
