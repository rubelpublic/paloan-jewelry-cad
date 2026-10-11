# AI mesh → production NURBS

## Triage (run Paloan Mesh Lab or `python -m paloan_cad mesh_analyzer file.stl`)
Record: units (guess from size: < 0.2 → m, < 1.2 → inch, < 6 → cm), bbox, triangle count, shells, naked/non-manifold edges, holes, wall thickness distribution, symmetry RMS, ring hole Ø, gem candidates (small convex shells with aspect < 2.2).

## Decision table
| Zone (Mesh Lab colour) | Typical content | Method |
|---|---|---|
| Smooth / flowing (green) | shank bodies, organic swells, domes | QuadRemesh → ToSubD → ToNURBS, or rebuild as Loft/Sweep from sections |
| Detail (amber) | prongs, claws, spikes, crisp edges, carvings, filigree | Manual NURBS from curves (Pipe, Revolve, Sweep2, NetworkSrf) or Displace for carving |
| Thin (red) | AI wisps, filigree < 0.6 mm, knife edges | Rebuild at ≥ 0.6 mm (gold) / 0.8 mm (silver) or delete |
| Defect (violet) | holes, non-manifold, self-intersections | Repair or delete before conversion |
| Gem candidates | faceted blobs | Delete; replace with calibrated gem objects at the same centre |

Always rebuild **manually**: stone seats, prongs, shank/finger hole (true circle at exact size), hinges/clasps/bails, any surface that must be dimensionally exact. Use **SubD** for: sculptural bodies, organic transitions, flowing ribbons.

## Rhino steps
1. Import, `Scale` to mm, `Move` centre to origin, orient (ring axis = Y). Lock a copy on `Reference`.
2. `ReduceMesh` to 150–250k if larger (keep detail zones denser).
3. `MeshRepair` → `ExtractNonManifoldMeshEdges` → delete fragments (`SelMeshDisjoint`/`SplitDisjointMesh`) → `FillMeshHoles` → `UnifyMeshNormals` → `Weld` 180°.
4. Segment: `ExtractMeshPart`/`SplitMeshWithCurve` into shank, head, ornaments; one layer each.
5. Smooth parts: `QuadRemesh` (Target edge length 0.4–0.8 mm, Adaptive size 50, Adaptive quad count on, Detect hard edges on, Symmetry X/Y if symmetric) → `ToSubD` (crease detected edges) → clean with SubD gumball (`Ctrl+Shift` select edges) → `ToNURBS` → `Check`.
6. Detail parts: trace curves on the mesh (`Curve` with OSnap Mesh/Project), rebuild with Pipe/Sweep/Revolve; carvings: bake a height map (render depth or Blender) → `carving_surface_builder` / MatrixGold Texture / `Displace` on a clean base.
7. Mirror if symmetric (`Mirror` + `Join`, check the seam G1).
8. Stones: calibrated gems; seats via BooleanDifference.
9. Validate: `Check`, `ShowEdges`, wall thickness (`wall_thickness_validator` on an export), `Volume` → weight vs target.

## Typical AI-mesh failures and fixes
- Prongs fused into the stone → delete, rebuild head from the gem outward.
- Stone not round/faceted → replace.
- Floating ornaments → connect with ≥ 0.8 mm bridges or delete.
- Shank out of round (> 3 %) → rebuild shank parametrically, transplant head.
- Paper-thin filigree → re-pipe centre-curves at 0.7 mm.
- Mirror asymmetry 2–5 % → rebuild half and mirror.
- Inverted / doubled shells → UnifyMeshNormals, delete inner shells.
