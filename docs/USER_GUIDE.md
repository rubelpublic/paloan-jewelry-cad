# Paloan Jewelry CAD Master — user guide

## 1. Design tab
- **Jewelry type** chooses the generator; **Template** loads a complete starting design.
- **Design style** applies a style preset (gothic, hammered, art deco …) and shows what the style means in geometry.
- Parameter groups fold open/closed (click the group title). Sliders preview instantly; the full build (stone seats, openwork, hollowing booleans, exact weight, checks) follows ~0.2 s later.
- **Target weight** + **Optimize to target weight**: the solver hollows hidden metal first, then adjusts thickness, then width, never crossing manufacturing minimums. The log appears in the right panel.
- **Save project / Open project** (JSON) and **Copy share link** (the design is encoded in the URL).
- Pendant outline **Custom SVG**: upload an SVG; the largest closed shape becomes the outline, scaled to the height/width sliders.

## 1b. Image → 3D
- **Add an image:** drag it in, paste it (Ctrl+V anywhere in the app), or tap *browse / camera* on a phone.
- **Background removal:** *Auto* uses PNG transparency when the image has it, otherwise the colour difference from the border. Adjust the threshold, invert the mask for dark objects on light backgrounds, untick *Fill holes* to keep piercings or a ring's finger hole, and use *Smooth* to clean ragged edges. The preview shows the mask, the traced outline (blue) and the height map.
- **Relief from shading:** detail blur, contrast and invert control how the image brightness becomes height.
- **Convert to:**
  - *Relief charm* turns the image silhouette into a relief with a bail.
  - *Silhouette pendant* uses the outline as a pendant shape, so stones, openwork, spikes and hollowing all work on it.
  - *Coin / medallion* is a round coin with a raised border.
  - *Signet ring face* engraves the image into a signet top.
  - *Auto-detect* reads type, metal, stone and size from a product photo.
  - *AI interpret* sends the image to Claude.
- The image is saved inside project files (*Save project*). Share links don't carry the image.

## 1c. Text, signets and more ring options
- **Name necklace** (Jewelry type → Name / text pendant):
  - Type the name and pick a font, or upload your own TTF/OTF with *+ Add font*.
  - Script fonts connect by themselves. Block fonts need an *Underline bar* or a *Back plate*.
  - *Floating i/j dots → Remove* keeps the piece castable in one part.
  - The checks show whether everything is one connected piece and how thin the strokes are.
- **Signet:** Shank style → Signet. Choose the top shape and size, then the face: plain, engraved or raised initials, or an engraved or raised image from Image → 3D.
- **Three-stone:** Side stones → Three-stone, with side cut, size ratio and setting. Pear and marquise sides point towards the centre stone.
- **Eternity:** Pavé & eternity → Half or Full eternity. Full eternity rings can't be resized.
- **Inside engraving:** Engraving → text, font, letter height and depth. The text is wrapped onto the finger surface and cut by a boolean.
- **Two-tone:** Material → Head / setting metal. Weights are calculated per alloy.
- **Finish:** polished, satin, matte, brushed or oxidised (shown in the viewer and noted in the report).
- **Undo/redo** (↶ ↷, Ctrl+Z / Ctrl+Y), **turntable** (⟳), and **✦ 6 design variations**.

## 2. Right panel
- **Weight card**: finished weight in the chosen alloy (pairs for earrings), metal volume (exact union of all parts), cast weight (+4 %), resin/wax model weight, surface area, total carats, bounding box, metal cost (set price on the Report tab).
- **Manufacturability**: every check with pass / warn / fail, the measured value and the fix. Score = 100 − 20 per fail − 6 per warn.
- **Parts & layers**: each component is a separate editable body (the same layers the Rhino export creates). Click ● to hide/show.

## 3. Viewport
3D / Front / Top / Side views, wireframe, section cut (see hollowing and seats), stones on/off, dimensions box + HUD (sizes, ring size in US/UK/EU/IN, stone size, head height). **Ref** overlays a reference image (opacity slider) to match proportions by eye.

## 4. AI Brief
- **Build offline** parses plain language: type, style, metal, cut, gem, carat or mm size, prongs, ring size, width/thickness/height, spikes, openwork, coils, cathedral, milgrain, pavé, hollowing, hinge, target grams.
- **Ask Claude** (needs your Anthropic API key in ⚙ AI): send the brief + reference images; Claude answers as a senior jewelry CAD engineer (construction breakdown, setting logic, safe dimensions, weight, Rhino workflow) and returns parameters that the app builds automatically.
- **Review CAD vs reference** sends the reference image(s) plus a render of your current model for a defect list with numeric corrections.
- The key is stored only in your browser (session, or device if you tick *Remember*) and sent only to api.anthropic.com.

## 5. Mesh Lab
Drop STL / OBJ / GLB / GLTF / FBX / PLY. Units are auto-detected (override if wrong). The analysis reports topology (naked / non-manifold edges, holes, shells, degenerate faces), volume and weight (exact if watertight, ray-parity estimate otherwise), wall thickness (min / 5th percentile / median, % below your minimum), symmetry, ring size, gem candidates and the rebuild-zone map:
green = QuadRemesh → SubD → NURBS · amber = rebuild manually · red = too thin · violet = defects.
Download the prioritised rebuild plan, or click **Rebuild as parametric ring** to continue at the detected size.

## 6. Rhino / GH
- **Download Rhino .py** → in Rhino: `RunPythonScript` (Rhino 7) or open in ScriptEditor and run (Rhino 8). The design is rebuilt as NURBS polysurfaces on `PJC::Metal::…`, `PJC::Stones::…` and hidden `PJC::Cutters::…` layers, with a weight report on the command line.
- **Grasshopper**: paste the same script into a GhPython component with input `P` (string) and outputs `a`, `b`; feed `P` with **Copy params JSON**.
- STL (metal only, for casting resin), STL (all), OBJ, GLB exports are Z-up millimetres.
- The **construction workflow** lists the Rhino / MatrixGold steps with the real numbers for the current design.

## 7. Report
Production sheet (Markdown download or Print → PDF): summary, alloys, stones, checks with fixes, components, construction plan and full parameters.

## Tips
- Weights are for the finished piece; findings (posts, backs, clasps) are bought parts — only clasp weight is added for chains.
- Moving the stone size updates prong Ø automatically when "Prong Ø" is 0 (auto).
- Set the metal first: minimums differ for silver and platinum.
