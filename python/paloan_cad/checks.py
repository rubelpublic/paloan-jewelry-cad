"""Engineering calculators behind several CLI tools: manufacturability rules, prongs, seats, spikes,
joints, measurements, weight and backside optimisation. All functions return plain dicts."""
import math

from . import core

R = core.RULES


def _c(level, title, detail, fix=""):
    return {"level": level, "title": title, "detail": detail, "fix": fix}


# ---------------- prong_optimizer ----------------
def prong_plan(cut, length, width, count=None, metal="18ky"):
    """Recommend prong count, diameter, positions (degrees, 0 = toward finger tip) and bearing depth."""
    mind = min(length, width)
    dia = core.prong_dia_for(mind) * (0.92 if metal == "pt950" else 1.0)
    if count is None:
        count = 3 if cut == "trillion" else 5 if cut in ("pear", "heart") else 6 if (cut == "marquise" or mind > 7.5) else 4
    angles = prong_angles(cut, count)
    checks = []
    if cut in core.POINTED_CUTS and count < core.POINTED_CUTS[cut] + 2:
        checks.append(_c("fail", "Unprotected points", "%s needs V-prongs on every point" % cut, "Use ≥ %d prongs" % (core.POINTED_CUTS[cut] + 2)))
    if mind > 7.5 and count < 6 and cut not in core.CORNER_CUTS:
        checks.append(_c("warn", "Large stone on few prongs", "%d prongs on %.1f mm" % (count, mind), "Use 6 prongs or double claws"))
    perimeter = math.pi * (3 * (length + width) / 2 - math.sqrt((3 * length / 2 + width / 2) * (length / 2 + 3 * width / 2)))
    gap = perimeter / count - dia
    return {"count": count, "diameter": round(dia, 2), "bearing_depth": round(min(0.3 * dia, 0.25), 2),
            "angles_deg": [round(math.degrees(a) % 360, 1) for a in angles], "clear_gap_between_prongs": round(gap, 2),
            "tip_height_above_girdle": round(mind * 0.15 * 0.62, 2), "checks": checks}


def prong_angles(cut, count):
    if cut == "trillion":
        a = [2 * math.pi * k / 3 for k in range(3)]
        return a + ([2 * math.pi * (k + 0.5) / 3 for k in range(3)] if count >= 6 else [])
    if cut in ("pear", "heart"):
        rest = max(2, count - 1)
        spread = 1.9 if rest == 2 else 2.6
        return [0.0] + [math.pi + (k / float(rest - 1) - 0.5) * spread for k in range(rest)]
    if cut == "marquise":
        out = [0.0, math.pi]
        sides = max(0, (count - 2) // 2)
        for j in range(sides):
            a = math.pi / 2 + ((j + 0.5) / sides - 0.5) * 1.3
            out += [a, -a]
        return out
    off = math.pi / 4 if (cut in core.CORNER_CUTS or count == 4) else (0.0 if count == 6 else math.pi / count)
    return [off + 2 * math.pi * k / count for k in range(count)]


# ---------------- stone_seat_generator ----------------
def seat_spec(cut, length=None, width=None, carat=None, gem="diamond", setting="prong"):
    """Seat (bearing) geometry: girdle outline offsets, bur sizes, seat depth below the table."""
    if carat is not None and (length is None or width is None):
        length, width, depth = core.stone_dims(cut, carat, gem)
    else:
        ratio, w1, dfrac, _ = core.CUTS.get(cut, core.CUTS["round"])
        depth = min(length, width) * dfrac
        carat = core.carat_from_dims(cut, length, width, gem)
    mind = min(length, width)
    crown, girdle = mind * 0.15, mind * 0.03
    pav = depth - crown - girdle
    out = {"cut": cut, "length": length, "width": width, "depth": depth, "carat": carat, "crown": crown, "girdle": girdle,
           "pavilion": pav, "seat_clearance": 0.03, "cutter_growth": 0.06}
    if setting == "prong":
        out["bearing_depth"] = round(min(0.3 * core.prong_dia_for(mind), 0.25), 2)
        out["bearing_height_below_table"] = round(crown + girdle / 2, 2)
        out["seat_bur_mm"] = round(length if cut == "round" else mind, 2)
    elif setting == "bezel":
        out["bezel_wall"] = 0.7 if mind > 4 else 0.55
        out["bezel_lip"] = round(min(0.35, mind * 0.06), 2)
        out["bezel_height_above_girdle"] = round(crown * 0.35 + girdle / 2, 2)
    elif setting == "pave":
        out["hole_dia"] = round(mind * 0.7, 2)
        out["bead_dia"] = round(max(0.5, mind * 0.32), 2)
        out["gap"] = 0.1
    out["light_hole"] = round(mind - 2 * min(0.6, mind * 0.12), 2)
    return out


# ---------------- spike_stability_checker ----------------
def spike_check(base, length, metal="18ky", tip_radius=0.12):
    ratio = length / base
    checks = []
    if base < R["spike_base_min"]:
        checks.append(_c("fail", "Fragile spike", "base %.2f mm" % base, "base ≥ %.1f mm" % R["spike_base_min"]))
    if ratio > R["spike_ratio_fail"]:
        checks.append(_c("fail", "Too slender", "ratio %.1f:1" % ratio, "length ≤ %.2f mm" % (base * R["spike_ratio_warn"])))
    elif ratio > R["spike_ratio_warn"]:
        checks.append(_c("warn", "Long spike", "ratio %.1f:1" % ratio, "length ≤ %.2f mm" % (base * R["spike_ratio_warn"])))
    if tip_radius < 0.1:
        checks.append(_c("warn", "Sharp tip", "tip radius %.2f mm can scratch the wearer" % tip_radius, "round tips to ≥ 0.1 mm"))
    if metal in core.SOFT_METALS and ratio > 2.0:
        checks.append(_c("warn", "Soft alloy", "%s spikes bend easily" % core.METALS[metal][0], "keep ratio ≤ 2:1 in soft metals"))
    vol = math.pi * (base / 2) ** 2 * length / 3
    return {"base": base, "length": length, "ratio": round(ratio, 2), "volume_mm3": round(vol, 3), "grams_each": round(core.grams(vol, metal), 4),
            "max_safe_length": round(base * R["spike_ratio_warn"], 2), "ok": not any(c["level"] == "fail" for c in checks), "checks": checks}


# ---------------- joint_validator ----------------
def joint_check(kind, clearance=None, wire=None, inner_w=None, inner_l=None, knuckles=3, width=None):
    checks = []
    out = {"kind": kind}
    if kind == "hinge":
        c = clearance
        if c < R["hinge_clear_min"]:
            checks.append(_c("fail", "Hinge will seize", "%.2f mm" % c, "use 0.08–0.15 mm"))
        elif c > R["hinge_clear_max"]:
            checks.append(_c("warn", "Sloppy hinge", "%.2f mm" % c, "≤ 0.15 mm"))
        if width:
            out["knuckle_length"] = round((width - (knuckles - 1) * c) / knuckles, 3)
        out["pin_dia_recommended"] = 1.0
    elif kind == "link":
        free = inner_w - 2 * wire
        out["free_play"] = round(free, 3)
        if wire < R["chain_wire_min"]:
            checks.append(_c("warn", "Fine wire", "%.2f mm" % wire, "≥ 0.6 mm for gold"))
        if free < 0.15:
            checks.append(_c("fail", "Links cannot articulate", "free play %.2f mm" % free, "inner width > 2×wire + 0.2 mm"))
        if inner_l:
            out["pitch"] = inner_l
            out["link_volume_mm3"] = round(math.pi * (wire / 2) ** 2 * (2 * (inner_l - inner_w) + math.pi * (inner_w + wire)), 3)
    elif kind == "jumpring":
        out["min_inner"] = round(2 * wire + 0.3, 2)
        if inner_w < out["min_inner"]:
            checks.append(_c("fail", "Jump ring too small", "%.2f mm" % inner_w, "≥ %.2f mm" % out["min_inner"]))
    out["checks"] = checks
    out["ok"] = not any(c["level"] == "fail" for c in checks)
    return out


# ---------------- measurement_validator ----------------
def measure_check(spec, actual, tol=0.05):
    """Compare requested dimensions with measured ones. spec/actual: {name: mm}."""
    rows = []
    for k, want in spec.items():
        got = actual.get(k)
        if got is None:
            rows.append({"dim": k, "want": want, "got": None, "ok": False})
            continue
        dev = got - want
        rows.append({"dim": k, "want": want, "got": got, "dev": round(dev, 3), "ok": abs(dev) <= tol * (1 if k != "weight" else max(1, want))})
    return rows


def ring_sizes(us=None, diameter=None):
    if us is None:
        us = core.diameter_to_us(diameter)
    d = core.us_to_diameter(us)
    return {"us": round(us, 2), "diameter_mm": round(d, 2), "circumference_mm": round(math.pi * d, 2), "eu": round(core.us_to_eu(us), 1),
            "uk": core.us_to_uk(us), "india": core.us_to_india(us)}


# ---------------- backside_optimizer ----------------
def ring_hollow_saving(inner_d, width, thickness, depth, rail=0.8, span_deg=200, metal="18ky", texture_depth=0.0):
    """Metal saved by an under-shank channel; returns grams saved and the wall left."""
    hw = max(0.0, width - 2 * rail)
    arc = math.radians(span_deg) * (inner_d / 2 + depth / 2)
    vol = hw * 0.95 * depth * arc * 0.94          # ramps at both ends
    wall = thickness - depth - texture_depth
    checks = []
    if wall < R["hollow_wall_min"]:
        checks.append(_c("fail", "Wall too thin", "%.2f mm left" % wall, "reduce depth to %.2f mm" % (thickness - R["hollow_wall_min"] - texture_depth)))
    if rail < R["hollow_rail_min"]:
        checks.append(_c("warn", "Narrow rails", "%.2f mm" % rail, "≥ 0.8 mm"))
    return {"volume_saved_mm3": round(vol, 2), "grams_saved": round(core.grams(vol, metal), 3), "wall_left": round(wall, 3),
            "max_safe_depth": round(thickness - R["hollow_wall_min"] - texture_depth, 3), "checks": checks}


def pendant_hollow_saving(area_mm2, thickness, front_wall, rim, perimeter_mm, metal="18ky"):
    inner_area = max(0.0, area_mm2 - perimeter_mm * rim)
    depth = max(0.0, thickness - front_wall)
    vol = inner_area * depth
    checks = [] if front_wall >= R["hollow_wall_min"] else [_c("fail", "Front wall too thin", "%.2f mm" % front_wall, "≥ 0.6 mm")]
    return {"volume_saved_mm3": round(vol, 2), "grams_saved": round(core.grams(vol, metal), 3), "checks": checks}


def target_thickness_for_weight(inner_d, width, target_g, metal="18ky", fill=0.88):
    """Solve the band thickness that gives a target weight (plain band)."""
    lo, hi = 0.3, 6.0
    for _ in range(60):
        mid = (lo + hi) / 2
        g = core.grams(core.band_volume(inner_d, width, mid, fill), metal)
        if g > target_g:
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2, 3)


# ---------------- manufacturing_checker ----------------
def check_design(d):
    """Validate a design dict (same keys as the web app export, plus measured values when known)."""
    metal = d.get("metal", "18ky")
    soft = metal in core.SOFT_METALS
    out = []
    t = d.get("type", "ring")
    if t in ("ring", "bangle"):
        tmin = min(d.get("thickTop", d.get("thickness", 1.6)), d.get("thickBottom", d.get("thickness", 1.6)))
        fail = (1.4 if t == "bangle" else R["ring_shank_fail"]) + (0.2 if soft else 0)
        warn = (1.8 if t == "bangle" else R["ring_shank_warn"]) + (0.25 if soft else 0)
        if tmin < fail:
            out.append(_c("fail", "Shank too thin", "%.2f mm" % tmin, "≥ %.2f mm" % warn))
        elif tmin < warn:
            out.append(_c("warn", "Shank thin", "%.2f mm" % tmin, "≥ %.2f mm" % warn))
        else:
            out.append(_c("pass", "Shank thickness", "%.2f mm" % tmin))
        wmin = min(d.get("widthTop", d.get("width", 2)), d.get("widthBottom", d.get("width", 2)))
        if wmin < R["ring_width_min"]:
            out.append(_c("warn", "Narrow band", "%.2f mm" % wmin, "≥ 1.6 mm"))
    head = d.get("headType", "none")
    if head in ("prong", "halo") and t in ("ring", "pendant", "earring"):
        cut = d.get("cut", "round")
        if d.get("sizeMode") == "mm":
            L, W = d.get("stoneL", 6.4), d.get("stoneW", 6.4)
        else:
            L, W, _ = core.stone_dims(cut, d.get("carat", 1.0), d.get("gem", "diamond"))
        plan = prong_plan(cut, L, W, d.get("prongCount"), metal)
        pd = d.get("prongDia") or plan["diameter"]
        if pd < plan["diameter"] - 0.05:
            out.append(_c("fail", "Prongs undersized", "Ø %.2f mm" % pd, "≥ %.2f mm" % plan["diameter"]))
        else:
            out.append(_c("pass", "Prong diameter", "Ø %.2f mm" % pd))
        out += plan["checks"]
    if d.get("spikes", 0) > 0:
        out += spike_check(d.get("spikeBase", 1.1), d.get("spikeLen", 1.8), metal)["checks"] or [_c("pass", "Spikes", "stable")]
    if d.get("openBridge") is not None and d.get("openwork", "none") != "none":
        b = d["openBridge"]
        out.append(_c("fail" if b < R["bridge_fail"] else "warn" if b < R["bridge_warn"] else "pass", "Openwork bridges", "%.2f mm" % b))
    if d.get("hingeClearance") is not None and (d.get("hinge") or d.get("earType") == "hoop"):
        out += joint_check("hinge", clearance=d["hingeClearance"])["checks"] or [_c("pass", "Hinge", "%.2f mm" % d["hingeClearance"])]
    if t == "chain":
        out += joint_check("link", wire=d.get("wireDia", 0.8), inner_w=d.get("linkInnerW", 2.0), inner_l=d.get("linkInnerL", 3.2))["checks"]
    score = max(0, 100 - 20 * sum(c["level"] == "fail" for c in out) - 6 * sum(c["level"] == "warn" for c in out))
    return {"score": score, "checks": out}
