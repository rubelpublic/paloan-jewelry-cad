# Rhino NURBS construction recipes

Document: mm, abs tolerance 0.001, angle 0.1°. Ring in the **Front** view (XZ), finger axis = Y, head up +Z (MatrixGold convention). Layers: `PJC::Metal::Shank`, `…::Head::Prongs`, `…::Head::Gallery`, `…::Head::Bezel`, `…::Ornament::*`, `…::Findings::*`, `PJC::Stones::*`, `PJC::Cutters::*` (hidden), `Reference` (locked).

## Topology rules
- One closed polysurface per component; Join only what is physically one piece *and* must be one for editing. Keep stones and cutters separate.
- Before Booleans: both inputs closed (`Check`, `ShowEdges` naked = 0), normals out (`Dir`), no coincident faces (move cutters 0.01 mm past faces).
- Prefer Loft/Sweep with matching section point counts and aligned seams (`CrvSeam`), G1/G2 blends (`BlendSrf`, `MatchSrf`) over FilletEdge on complex junctions.
- Avoid: MeshToNURBS on dense meshes, trims on trims on trims, micro-faces < 0.01 mm², exploding solids to "fix" them.

## Shank
1. `Circle` Ø inner (US size formula) at origin, Front view.
2. Draw profile curves (comfort / D / knife / flat) at top and bottom with the target width × thickness; intermediate sections by `Tween`/scale. MatrixGold: *Shank Builder* with profile + width/thickness graphs.
3. Place 24–36 sections around the circle (`ArrayPolar` + `Scale1D` for taper or `OrientOnCrv`) and `Loft` *Closed* → closed polysurface; or `Sweep1` with the circle rail and multiple shapes.
4. Split shank: build each half at ½ width; morph the top third apart (`CageEdit` or `FlowAlongSrf`); join halves with a bridge under the head.
5. Texture (hammered, florentine): keep the master smooth; apply MatrixGold *Texture*/`Displace` on a copy for print/render.

## Head (prong)
1. Gem from Gem Studio (or faceted brep) at girdle height = shank top + gallery lift + pavilion depth.
2. Prong centre-lines: interpolate base (at 55–70 % radius inside the shank) → girdle point (prong centre = girdle radius + prong r − bearing) → tip. `Pipe` with radii 0.82 r → r; cap tips with spheres (round), elongated pipe (claw) or cone (pointed).
3. Rails: girdle outline scaled 0.7–0.9 and moved below the girdle; `Pipe` Ø 0.7 × prong Ø; check no pavilion contact.
4. Seats: duplicate gem, grow 0.03 mm/side → `BooleanDifference` prongs/rails − cutter (keep cutter on `Cutters::Seat`).
5. Merge head to shank with a blend or sink prong bases 0.3–0.5 mm into the shank (castable as one piece).

## Bezel
Offset girdle outline +wall and −lip; `ExtrudeCrv` both (solid), `BooleanDifference` inner from outer; subtract gem cutter; add light hole; `FilletEdge` 0.15 mm on the top edge.

## Halo
Offset girdle by melee/2 + gap + 0.25; `ArrayCrv` melee (count = perimeter / (melee + gap)); shared beads between melee; frame = offset band ± (melee/2 + 0.3) extruded to melee pavilion depth; subtract melee cutters.

## Cathedral / shoulders
`Pipe` or `Sweep2` from shoulder (±35–40°) to under-gallery; blend into shank with `BlendSrf` G2 then `Join`, or let them intersect and `BooleanUnion`.

## Spikes
`Revolve` a profile (base Ø, length, tip radius 0.1 mm) or `Cone`; `OrientOnSrf` onto surface normals (`ArrayPolar` around the shank); sink 0.25 mm; `BooleanUnion` in batches of ≤ 20.

## Openwork
Draw one window on a plane tangent to the surface (lancet = two arcs radius = span; quatrefoil; circle), `ExtrudeCrv` radially through the wall (+1 mm both sides), `ArrayPolar`, `BooleanDifference`. Check bridges with `Distance` between window edges.

## Coils / filigree
`Spiral` (flat) → `FlowAlongSrf` or `Project` onto the body; `Pipe` 0.8 → 0.6 mm; union to the base surface at ≥ 3 contact points per coil.

## Pendant
Outline curve (`InterpCrv` closed) → `ExtrudeCrv` solid thickness → `FilletEdge` 0.3–0.5 mm front; bail `Torus` axis along X; back hollow: offset outline −rim, extrude from the back to leave the front wall, subtract.

## Earrings / bangles / chain
- Stud: head + base plate + post (`Cylinder` 0.8 × 10 mm, modelled for position only — supplied as wire).
- Hoop: profile `Sweep1` around Ø with a 6° gap; hinged post wire.
- Bangle: oval rail (`Ellipse` inner W × H), profile `Sweep1`; hinge knuckles with 0.1 mm gaps; cuff ends filleted 0.8 mm.
- Chain: one link (stadium curve + Pipe), `ArrayCrv` along the neckline curve alternating 90°.

## Final checks
`Check`, `ShowEdges` (naked/non-manifold = 0), `SelBadObjects`, `Volume` → grams, `Distance` for critical dims, `Analyze ▸ Draft angle` not needed for casting; export STL at 0.005 mm.
