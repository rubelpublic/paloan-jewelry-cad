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

## 1d. Settings, gem library, petals, edit mode, AI bar (v1.2)
- **Gem library:** under Center stone, pick a calibrated size (e.g. 9 × 7 mm · 1.7 ct). The size sliders switch to millimetres automatically.
- **Setting types:** Prong / claw, Double prongs, Bezel, Half bezel, Collet (tapered cone, like the JFR "One-layer Collet"), Flush / gypsy, Halo.
- **Setting details:**
  - Prongs: tip height, bead size, basket taper and rotation.
  - Collet: height, taper, wall, top and bottom chamfers.
  - Flush: metal margin around the stone.
- **Flower petals:** petals per layer, layers, length, width, lift, curl, thickness, vein, tip shape and enamel colour. Template *Flower ring · lotus petals*.
- **✥ Edit mode:**
  - Click a part to select it, then drag the gumball: **W** move, **E** rotate, **R** scale (scale works as taper).
  - *Polar array* repeats the part around the stone axis, *Mirror* adds a mirrored copy, *Delete* removes the part, and *Reset* undoes your edits to it.
  - Edits are stored in the design (undo, save, share, Rhino workflow notes).
- **✨ AI edit bar** (bottom of the viewport):
  - Plain-language edits such as "bigger stone", "2 ct", "6 prongs", "collet setting", "add flower with 10 petals", "longer petals", "green enamel", "rose gold", "thicker band", "taller head", "add spikes", "engrave 'Forever'", "8 g".
  - Start with "new …" to begin a new design.
  - Anything the offline parser doesn't understand goes to Claude (with an API key) and only the changed parameters are applied.

## 1e. Free AI, photo → 3D, auto-fix, sets, style mixer (v1.3)
- **⚙ AI settings:** the default is **Puter.js**, free with no API key. The first request opens a free Puter sign-in. Other providers with **free keys**:
  - Pollinations: https://enter.pollinations.ai/keys (also powers concept images)
  - Google Gemini: https://aistudio.google.com/app/apikey
  - Groq: https://console.groq.com/keys
  - OpenRouter, using `:free` models: https://openrouter.ai/keys

  All of these can read photos. Claude needs a paid key. *Test connection* checks the setup.
- **Free concept images:** Image → 3D → *Generate a concept*. Describe the piece and the image loads ready for conversion.
- **Sketch pad:** draw an outline, then *Use sketch* to get a silhouette pendant or relief.
- **Background brush:** *＋ Keep* / *－ Remove* paints over the preview to fix the mask. ↺ clears your strokes.
- **📷 Product photo → fully editable 3D:**
  - Detects type, metal, stone, size, finger hole and spikes, and builds a parametric model.
  - The photo is overlaid in front view so you can match it (double-click the overlay to hide it).
  - With *Let the AI refine* ticked, the AI corrects the parameters.
  - Everything stays editable: sliders, ✥ Edit gumball, the ✨ AI bar.
- **⚒ Auto-fix** (Manufacturability card) applies parameter fixes for every warning and failure, up to 3 passes. Undo with Ctrl+Z.
- **◈ Matching set** shows a coordinated ring, pendant, studs, drops, bangle and chain as thumbnails. Click one to design it.
- **Style mixer:** choose two styles and a blend, then *Apply mixed style*.

## 1f. 💎 Gems, 📚 Library, gem map, summary (v1.4)
- **💎 Gems tab:**
  - Set the gem (cut, calibrated size, material, table height above the metal, rotation), the prongs (count, Ø, height, tip, overlap) and the cutter (tolerance, top extension, culet hole Ø and depth).
  - **● Place gems** places a gem wherever you click on the metal. **⋯ Row** fills the span between two clicks at the target gap.
  - **Mirror X** places the matching gem on the other side.
  - **⇲ Compact to gap** pulls placed gems together or apart to the exact gap along the surface. **⟲ Re-snap** puts gems back on the surface after you change the piece.
  - **Apply settings to all** updates every placed gem. Delete gems one at a time from the list.
  - **⟷ Show distances** draws colour-coded gap lines between all gems; the stats show the closest gap and the collision count.
  - **◉ Gem map view** colours gems by size with a legend. **⬇ Gem map PNG** exports it.
- **📚 Library:** the asset manager.
  - **☆ Save current design**, **☆ Save selected part** (turn on ✥ Edit and click a part first) and **☆ Save gem setting**.
  - Built-in gems, prong sets, cutters and settings are included.
  - **Use** loads a gem asset into Gem tools; **Insert** adds a saved part to the current design, then position it with ✥ Edit; **Open** opens a saved design.
  - Export or import the whole library as JSON.
- **Weights:** 24 alloys, custom alloys (name + density) and wax/resin model weights, in the right panel.
- **▤ Summary with gem map** (Report tab): overview, gem table with carat totals, gem map image, weights in every alloy, components and checks. Print it or download it as HTML.

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
