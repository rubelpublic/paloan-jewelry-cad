// Model pipeline: parametric build -> boolean operations (seats, openwork, hollowing) -> measurement.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { buildRing } from './geom/ring.js';
import { buildPendant } from './geom/pendant.js';
import { buildEarring, buildBangle, buildChain } from './geom/others.js';
import { merge, signedVolume, surfaceArea } from './geom/util.js';
import { METALS, GEMS } from './data.js';

export const BUILDERS = { ring: buildRing, pendant: buildPendant, earring: buildEarring, bangle: buildBangle, chain: buildChain };

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

function prep(g) {
  const h = g.clone();
  for (const k of Object.keys(h.attributes)) if (k !== 'position' && k !== 'normal') h.deleteAttribute(k);
  if (!h.attributes.normal) h.computeVertexNormals();
  return h;
}
const boxOf = (g) => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; };

/** A − B. Returns A untouched when the boxes do not overlap or the boolean fails. */
export function subtract(a, b) {
  if (!boxOf(a).intersectsBox(boxOf(b))) return a;
  try {
    const A = new Brush(prep(a)), B = new Brush(prep(b));
    A.updateMatrixWorld(); B.updateMatrixWorld();
    const r = evaluator.evaluate(A, B, SUBTRACTION).geometry;
    if (!r.attributes.position || r.attributes.position.count < 3) return a;
    r.computeBoundingBox();
    return r;
  } catch (e) {
    console.warn('CSG failed', e);
    return a;
  }
}

/** Build a model. opts.csg=false skips booleans (fast preview while dragging sliders). */
export function generate(type, params, { csg = true } = {}) {
  const build = BUILDERS[type];
  if (!build) throw new Error('Unknown jewelry type ' + type);
  const model = build(params);
  model.type = type;
  model.booleans = [];
  const asGeo = (c) => (Array.isArray(c.geometry) ? merge(c.geometry, 0.1) : c.geometry);
  if (csg && params.seatCut !== false) {
    for (const cut of model.cutters.filter((c) => c.type === 'seat')) {
      const g = asGeo(cut);
      for (const part of model.parts) if (part.seatCut && part.kind === 'metal') {
        part.pieces = part.pieces.map((pc) => subtract(pc, g));
        model.booleans.push(`Seat cut → ${part.name}`);
      }
    }
    if (model.meta.haloCutters) {
      const hc = merge(model.meta.haloCutters.map((g) => g.clone().scale(1, 1, 1)), 0.1);
      for (const part of model.parts) if (part.haloSeat) { part.pieces = part.pieces.map((pc) => subtract(pc, hc)); model.booleans.push('Halo seats → frame'); }
    }
  }
  delete model.meta.haloCutters;
  if (csg) {
    const order = { hollow: 0, light: 1, openwork: 2 };
    for (const cut of model.cutters.filter((c) => c.target).sort((a, b) => order[a.type] - order[b.type])) {
      const g = asGeo(cut);
      for (const part of model.parts) if (part.csgTarget === cut.target) {
        part.pieces = part.pieces.map((pc) => subtract(pc, g));
        model.booleans.push(`${cut.type} → ${part.name}`);
      }
    }
  }
  return model;
}

/** Exact-enough metal volume of the union of all closed shells (handles overlapping parts) by ray parity. */
export function unionVolume(geoms, res = 200) {
  if (!geoms.length) return 0;
  const box = new THREE.Box3();
  const items = geoms.map((g) => {
    const bb = boxOf(g).clone(); box.union(bb);
    if (!g.boundsTree) g.boundsTree = new MeshBVH(g);
    return { bb, bvh: g.boundsTree };
  });
  const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y;
  const cell = Math.max(sx, sy) / res;
  const nx = Math.ceil(sx / cell), ny = Math.ceil(sy / cell);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  const z0 = box.min.z - 1;
  let total = 0;
  const ints = [];
  for (let i = 0; i < nx; i++) {
    const x = box.min.x + (i + 0.5) * cell + 1.37e-4;
    for (let j = 0; j < ny; j++) {
      const y = box.min.y + (j + 0.5) * cell + 0.71e-4;
      ints.length = 0;
      for (const it of items) {
        if (x < it.bb.min.x || x > it.bb.max.x || y < it.bb.min.y || y > it.bb.max.y) continue;
        ray.origin.set(x, y, z0);
        const hits = it.bvh.raycast(ray, THREE.DoubleSide);
        if (hits.length < 2) continue;
        const d = hits.map((h) => h.distance).sort((a, b) => a - b);
        const u = [d[0]];
        for (let k = 1; k < d.length; k++) if (d[k] - u[u.length - 1] > 1e-5) u.push(d[k]);
        for (let k = 0; k + 1 < u.length; k += 2) ints.push([u[k], u[k + 1]]);
      }
      if (!ints.length) continue;
      ints.sort((a, b) => a[0] - b[0]);
      let [s, e] = ints[0];
      for (let k = 1; k < ints.length; k++) {
        if (ints[k][0] <= e) e = Math.max(e, ints[k][1]);
        else { total += e - s; [s, e] = ints[k]; }
      }
      total += e - s;
    }
  }
  return total * cell * cell;
}

/** Measurements: union metal volume, weights per alloy, stone carats, bbox, areas, per-part breakdown. */
export function measure(model, metalKey, { res = 200 } = {}) {
  const metalShells = [], parts = [];
  let analytic = 0, stoneCt = 0, area = 0;
  const box = new THREE.Box3();
  for (const part of model.parts) {
    let v = 0;
    for (const g of part.pieces) { v += Math.abs(signedVolume(g)); box.union(boxOf(g)); }
    if (part.kind === 'metal') {
      if (part.analyticVolume) { analytic += part.analyticVolume; v = part.analyticVolume; }
      else metalShells.push(...part.pieces);
      for (const g of part.pieces) area += surfaceArea(g);
    } else {
      const gem = GEMS[part.gem] || GEMS.diamond;
      stoneCt += (v * gem.density) / 1000 / 0.2;
    }
    parts.push({ name: part.name, layer: part.layer, kind: part.kind, volume: v, pieces: part.pieces.length });
  }
  const union = unionVolume(metalShells, res) + analytic;
  const metal = METALS[metalKey] || METALS['18ky'];
  let grams = (union * metal.density) / 1000;
  if (model.meta.pair) grams *= 2;
  if (model.meta.claspWeight) grams += model.meta.claspWeight * metal.density / METALS['14ky'].density;
  const size = box.getSize(new THREE.Vector3());
  return { volume: union, grams, stoneCt: stoneCt * (model.meta.pair ? 2 : 1), area, bbox: { x: size.x, y: size.y, z: size.z }, parts, metal: metalKey, pair: !!model.meta.pair };
}

export const weightIn = (volume, key, pair) => (volume * (METALS[key] || METALS['18ky']).density / 1000) * (pair ? 2 : 1);
