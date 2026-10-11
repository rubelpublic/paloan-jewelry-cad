# Paloan Jewelry CAD Master

**AI concept → editable Rhino NURBS → manufacturing-ready jewelry.**
Free, open-source jewelry CAD engineer that runs in your browser, plus a Python toolkit and a Claude skill.

**Live app:** https://rubelpublic.github.io/paloan-jewelry-cad/

AI image generators make beautiful jewelry that can't be manufactured: wrong prongs, seats that don't fit, wisps too thin to cast, gold-heavy backs, broken meshes. Paloan works like a senior jewelry CAD engineer. It builds the piece parametrically with real stone seats, checks every feature against casting and setting tolerances, hits your target gold weight, and exports a Rhino/Grasshopper script that rebuilds the same design as clean NURBS polysurfaces.

## What it does

| Capability | In the app |
|---|---|
| **Jewelry design intelligence** | Rings, pendants and charms, stud/hoop/drop earrings, bangles and cuffs, chains. Shank, gallery, basket, prongs, bezel, halo, cathedral, pavé, milgrain, bail, hinge and post are each a separate editable part on a layer tree. |
| **Style intelligence** | 13 style presets (gothic, contemporary, luxury, hammered, organic, sculptural, floral, art deco, vintage, architectural, minimal, tribal, classic) that translate into real geometry: spikes, lancet openwork, knife edges, Worley-hammered dents, vines and coils, twists, milgrain. |
| **Stones and settings** | 11 cuts (round, oval, cushion, princess, emerald, asscher, radiant, pear, marquise, heart, trillion) and 10 gem materials. Converts carats to mm. Places V-prongs on the points of each cut, sizes prongs from the stone, and cuts real boolean seats into prongs, bezels and halo frames. |
| **Manufacturability validation** | Rules engine with pass/warn/fail results and fixes: shank and wall thickness, prong Ø, seat depth, culet clearance, head height, spike stability, openwork bridges, hollow walls, halo spacing, hinge clearance, link articulation, ear posts, bails. Gives a score out of 100. |
| **Metal optimisation** | Under-shank and back hollowing, openwork, and an **"Optimize to target weight"** solver: hollow first, then thickness, then width, never below the minimums. |
| **Measurement and weight** | Exact metal volume (ray-parity union of all parts), weight in 13 alloys, cast weight, resin weight, carat totals, metal cost. Ring sizes in US/UK/EU/India. |
| **Mesh → CAD reconstruction** | Mesh Lab loads STL/OBJ/GLB/FBX/PLY and reports naked/non-manifold edges, holes, shells, a wall-thickness map, symmetry, ring-size detection, gem candidates and colour-coded rebuild zones (SubD vs manual). It writes a prioritised Rhino rebuild plan. |
| **Rhino / Grasshopper export** | One Python file rebuilds the design as clean NURBS (lofted shanks, piped prongs, revolved spikes, boolean seats) on `PJC::Metal / Stones / Cutters` layers. Works in Rhino 7 and 8, and as a GhPython component. Also exports STL/OBJ/GLB. |
| **AI (optional, bring your own key)** | Claude reads your brief and AI-generated reference images and returns an engineering plan with buildable parameters. It can also review your CAD render against the reference. An offline brief parser works with no key at all. |
| **Production report** | Spec sheet covering dimensions, weights per alloy, stones, validation results and the step-by-step Rhino/MatrixGold construction plan. Download as Markdown or print to PDF. |

## Quick start

**Use it online:** open the live app link above. Nothing to install.

**Run locally:**
```bash
git clone https://github.com/rubelpublic/paloan-jewelry-cad.git
cd paloan-jewelry-cad
python tools/serve.py        # http://localhost:8765
```
The app is static HTML and ES modules with no build step. Three.js, three-mesh-bvh and three-bvh-csg load from jsDelivr.

### Typical workflows
1. **AI image → CAD.** Go to *AI Brief*, drop the image, describe it, then click *Ask Claude* (or *Build offline*). Review the checks, click *Optimize to target weight*, and download the Rhino `.py` from *Rhino / GH*.
2. **AI mesh → NURBS.** Go to *Mesh Lab* and drop the STL/GLB. Read the zones and the plan, download the plan, then click *Rebuild as parametric ring* if a ring was detected.
3. **Design from scratch.** Pick a *Template* or *Design style*, then tune the parameters. Weight, checks and the construction workflow update live.

## Python toolkit
Pure Python 3.8+ with no dependencies. Pillow is needed only for carving reliefs.
```bash
cd python
python -m paloan_cad mesh_analyzer ring.stl --metal 18ky
python -m paloan_cad cad_rebuild_assistant ring.stl -o plan.md
python -m paloan_cad manufacturing_checker ../examples/gothic-ring.json
python -m paloan_cad prong_optimizer --cut pear --carat 1.5
python -m paloan_cad stone_seat_generator --cut oval --carat 2 --setting bezel
python -m paloan_cad spike_stability_checker --base 1.2 --length 2.4 --metal ag925
python -m paloan_cad joint_validator hinge --clearance 0.1 --width 6
python -m paloan_cad backside_optimizer ring --size 7 --width 7 --thickness 2 --depth 0.6
python -m paloan_cad weight_estimator --band 6.5 4 1.8 --stone round 1
python -m paloan_cad measurement_validator --ring-size 7
python -m paloan_cad openwork_builder --shape teardrop --hole 1.6 --bridge 0.9 -o openwork.svg
python -m paloan_cad coil_generator --turns 2.5 --wire 0.8 -o coil.obj
python -m paloan_cad carving_surface_builder heightmap.png --width 20 --height 20 -o relief.obj
python -m paloan_cad wall_thickness_validator ring.stl --min-wall 0.6
python -m paloan_cad rhino_macro_generator ../examples/solitaire.json -o solitaire.py
python -m paloan_cad grasshopper_builder -o paloan_gh.py
python -m paloan_cad nurbs_cleaner -o pjc_nurbs_cleaner.py
```
Each tool also has a stand-alone wrapper in `python/scripts/<tool>.py`.

## Claude skill
`skill/paloan-jewelry-cad-master/` is a Claude skill: a senior jewelry CAD engineer covering Rhino NURBS workflows, stone-setting engineering, casting tolerances, style translation, mesh-to-NURBS strategy, metal optimisation and Grasshopper systems. To use it, copy the folder into `~/.claude/skills/` (Claude Code) or upload it as a skill in Claude. The web app uses the same file as its AI system prompt.

## Project layout
```
index.html                 web app shell
app/css, app/js            viewer, UI, engine (CSG + exact volumes), validator, optimiser, mesh lab, AI, Rhino export
app/js/geom                parametric builders: ring, pendant, earrings, bangle, chain, stones & heads
python/paloan_cad          toolkit (17 tools) · python/rhino: Rhino builder + NURBS cleaner · python/tests
skill/                     Claude skill + engineering references
examples/                  sample design JSON files
docs/                      user guide
```

## Tests
```bash
python python/tests/test_toolkit.py         # toolkit (mesh analysis, checks, generators, CLI)
python python/tests/test_rhino_builder.py   # Rhino builder smoke test, 21 designs, mocked RhinoCommon
```
The Rhino builder is smoke-tested against a RhinoCommon mock, not inside Rhino itself. Please report anything that misbehaves in real Rhino.

## Contributing
Real-world feedback is the point of this project: Rhino and MatrixGold workflows, AI references, STL/FBX/GLB cases, and casting and setting results. Open an issue with the file and what went wrong, or send a PR. Tolerances live in `app/js/data.js` (`RULES`) and `python/paloan_cad/core.py`.

## Disclaimer
Weights, tolerances and checks are engineering guidance for CAD preparation. Always confirm critical dimensions with your caster and setter before production.

## License
MIT © Rubel Miah (Rapar Rubel). See `LICENSE`.
