# Parametric jewelry systems (Grasshopper / GhPython)

## Pattern
Inputs (sliders/value lists) → derived values (expressions) → curves → surfaces/breps → booleans → outputs (per layer) + weight panel. Clamp every input with manufacturing minimums so the definition can't produce unsafe geometry.

## Parametric solitaire ring
| Parameter | Range | Notes |
|---|---|---|
| ring size (US) | 3–13 step 0.25 | Ø = 11.63 + 0.8128·size |
| shank width top / bottom | 1.5–6 mm | bottom ≥ 1.6 |
| thickness top / bottom | 1.3–2.5 mm | bottom ≥ 1.3 (gold) |
| profile | comfort / D / knife / flat | superellipse exponents |
| stone cut + carat or L×W | list | dims = w1·∛ct |
| prong count / style / Ø | 3–8 / round, claw, pointed / auto | Ø auto from stone |
| gallery lift | 0.2–3 mm | culet ≥ 0.2 above shank |
| rails | 0–2 | |
| target weight | g | drives a Galapagos/bisection on thickness or hollow depth |

Component logic: `Circle` → `Perp Frames`(N=32) → profile `Superellipse` per frame (width/thickness graph mapper) → `Loft` (closed) ; stone → `Outline` → prong `Divide`/angles → `Interpolate` → `Pipe` (variable) → `Solid Difference` with grown stone; `Volume` → `×density/1000` → panel.

## Parametric gothic ring
Extra parameters: spike density (count), spike base/length (clamped ratio ≤ 2.5), spike rows, openwork pattern (lancet/quatrefoil/circle), window count & size (bridge ≥ 0.8 enforced), carving intensity (texture depth 0–0.4 with thickness compensation).

## Parametric pendant system
Outline (curve input or preset), width/height, thickness, edge radius, bail type & opening (≥ 3), stone/bezel, openwork hole/bridge/rim, back hollow front-wall (≥ 0.6), weight target, chain connector logic (bail axis ⟂ chain direction, jump ring Ø ≥ 2·wire + 0.3).

## Paloan GhPython component
`python -m paloan_cad grasshopper_builder -o paloan_gh.py` → paste into a GhPython component; input `P` (string) = design JSON (copy from the web app). Build `P` from sliders with a *Python* or *Format* component (`{"type":"ring","ringSize":{0},…}`) for a live parametric system; outputs `a` (breps) and `b` (report incl. weight).
