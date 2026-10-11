# Metal optimisation & weight targeting

## Formulas
- Weight (g) = volume (mm³) × density (g/cm³) / 1000.
- Plain band volume ≈ 2π · (r_in + t/2) · w · t · fill (fill: flat 0.97, comfort 0.85–0.9, D 0.8, round 0.785, knife 0.6).
- Under-shank channel saving ≈ (w − 2·rail) · depth · arc_length(span) · 0.94 (end ramps).
- Pendant back hollow saving ≈ (area − perimeter·rim) · (t − front_wall).
- Torus (round wire ring/hoop) = 2π² · R · r².
- Cable chain = links × π(d/2)² × (2(Lc − Wc) + π·Wc), Lc = inner L + d, Wc = inner W + d; links = length / inner L.

## Order of operations (keep the look, lose the gold)
1. **Hollow hidden metal**: under-shank channel (span 160–220°, rails ≥ 0.8, leave ≥ 0.6 mm wall), under-gallery scoops, pendant/bangle backs (front wall 0.6–0.8), hollow heads behind halos.
2. **Smart openwork** on hidden or design-relevant faces (lattice backs, pierced galleries) — bridges ≥ 0.8 mm.
3. **Trim non-structural thickness** to the minimum (shoulder flanks, pendant plates with rims).
4. **Reduce visible dimensions** last (width, head height), within the design intent.
5. Never thin: shank bottom below 1.3 mm (gold), prongs below the stone rule, bails, hinge knuckles.

## Worked example (from the spec)
"Reduce underside thickness by 0.2 mm to save ~1.5 g": an 18K band 7 mm wide, US 7 (r_in 8.66 mm), 2.0 mm thick: removing 0.2 mm over the lower 200° of the inner surface ≈ 7 × 0.2 × (200/360 × 2π × 8.76) ≈ 42.8 mm³ → 0.66 g in 18K. To save 1.5 g you need ≈ 97 mm³: a 0.5 mm deep channel with 0.8 mm rails over 200° ≈ (7 − 1.6) × 0.5 × 30.6 × 0.94 ≈ 77.6 mm³ → 1.20 g, or 0.6 mm deep ≈ 1.44 g (wall left 1.4 mm ✓).

## Weight targeting procedure (what the Paloan optimiser does)
1. Measure current weight (union volume, exact).
2. If heavier than target: hollow first (bisection on depth until target or wall minimum), then scale thickness to its minimum, then width.
3. If lighter: scale thickness up (≤ 1.6×) then width.
4. Stop within ±1 %; report each step (parameter, value, grams saved) and the final deviation (production tolerance ±5 %).
5. If unreachable, say which rule blocks it and propose a design change (smaller stone, more openwork, alloy switch e.g. 18K → 14K saves 15 %).
