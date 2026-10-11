# -*- coding: utf-8 -*-
"""
Paloan Jewelry CAD Master - Rhino / Grasshopper NURBS builder.

Rebuilds a Paloan design as clean, editable NURBS polysurfaces on a tidy layer tree:
    PJC::Metal::Shank, PJC::Metal::Head::Prongs, PJC::Metal::Head::Gallery, PJC::Stones, PJC::Cutters ...
Every component stays a separate closed polysurface (detachable / editable). Booleans are
used only where manufacturing needs them (stone seats, openwork, hollowing).

Usage
  Rhino 7/8 : RunPythonScript (or ScriptEditor) -> open this file. The web app prepends a
              PARAMS dict with your design; without it a default solitaire is built.
  Grasshopper: paste into a GhPython / Python 3 component. Optional input `P` (JSON string)
              overrides PARAMS; output `a` = list of Breps, `b` = report text.
Works on IronPython 2.7 (Rhino 7) and CPython 3 (Rhino 8). Units: millimetres.
Frame: ring lies in the Front (XZ) plane, finger axis = world Y, head up = +Z.
"""
import json
import math

import Rhino
import Rhino.Geometry as rg
import scriptcontext as sc
import System
import System.Drawing as SD

try:
    PARAMS  # noqa: F821 (provided by the web app export)
except NameError:
    PARAMS = {"type": "ring", "metal": "18ky", "ringSize": 6.5, "cut": "round", "carat": 1.0, "headType": "prong", "prongCount": 4}

try:
    if P:  # noqa: F821  (Grasshopper input)
        PARAMS = json.loads(P)  # noqa: F821
except NameError:
    pass

IN_GH = "ghenv" in globals()
DOC = sc.doc
TOL = 0.001
ANG = math.radians(1.0)
try:
    TOL = DOC.ModelAbsoluteTolerance
except Exception:
    pass

DENSITY = {"24k": 19.32, "22k": 17.8, "18ky": 15.5, "18kw": 15.9, "18kr": 15.2, "14ky": 13.1, "14kw": 12.6, "14kr": 13.0,
           "10ky": 11.6, "pt950": 20.1, "pd950": 12.0, "ag925": 10.36, "brass": 8.5}
CUTS = {  # ratio, width of 1 ct, depth %, table %
    "round": (1.0, 6.4, 0.615, 0.57), "oval": (1.40, 5.6, 0.60, 0.57), "cushion": (1.05, 5.6, 0.66, 0.60), "princess": (1.0, 5.5, 0.72, 0.68),
    "emerald": (1.40, 5.0, 0.65, 0.65), "asscher": (1.0, 5.5, 0.66, 0.62), "radiant": (1.25, 5.5, 0.66, 0.64), "pear": (1.55, 5.5, 0.60, 0.56),
    "marquise": (2.0, 5.0, 0.60, 0.56), "heart": (1.0, 6.2, 0.60, 0.56), "trillion": (1.0, 6.8, 0.45, 0.60)}
GEM_DENSITY = {"diamond": 3.52, "labdiamond": 3.52, "moissanite": 3.21, "sapphire": 4.0, "ruby": 4.0, "emerald": 2.72,
               "amethyst": 2.65, "tourmaline": 3.06, "onyx": 2.65, "cz": 5.8}
PROFILES = {"comfort": (2.2, 3.2), "dshape": (2.0, 14.0), "flat": (9.0, 9.0), "knife": (1.0, 6.0), "round": (2.0, 2.0), "square": (16.0, 16.0), "dome": (2.6, 10.0)}

CAP_NONE = getattr(rg.PipeCapMode, "None")
CAP_ROUND = rg.PipeCapMode.Round
OUT = []        # (brep, layer, name, kind)
REPORT = []


def g(key, default):
    v = PARAMS.get(key, default)
    return default if v is None else v


def log(msg):
    REPORT.append(msg)
    print(msg)


# ------------------------------------------------------------------ helpers
def P3(x, y, z):
    return rg.Point3d(x, y, z)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def layer_index(path, color=None):
    idx = DOC.Layers.FindByFullPath(path, -1)
    if idx >= 0:
        return idx
    parent = System.Guid.Empty
    cur = ""
    for name in path.split("::"):
        cur = name if not cur else cur + "::" + name
        idx = DOC.Layers.FindByFullPath(cur, -1)
        if idx < 0:
            lay = Rhino.DocObjects.Layer()
            lay.Name = name
            if parent != System.Guid.Empty:
                lay.ParentLayerId = parent
            if color is not None:
                lay.Color = color
            idx = DOC.Layers.Add(lay)
        parent = DOC.Layers[idx].Id
    return idx


def emit(brep, layer, name, kind="metal"):
    if brep is None:
        return
    if isinstance(brep, (list, tuple)):
        for b in brep:
            emit(b, layer, name, kind)
        return
    OUT.append((brep, layer, name, kind))


def interp(points, closed=False):
    pts = [rg.Point3d(p) for p in points]
    if closed:
        return rg.Curve.CreateInterpolatedCurve(pts, 3, rg.CurveKnotStyle.ChordPeriodic)
    return rg.Curve.CreateInterpolatedCurve(pts, 3)


def polyline(points, closed=True):
    pts = [rg.Point3d(p) for p in points]
    if closed:
        pts.append(rg.Point3d(points[0]))
    return rg.PolylineCurve(pts)


def pipe(curve, r0, r1=None, capmode=None):
    capmode = CAP_ROUND if capmode is None else capmode
    if r1 is None:
        res = rg.Brep.CreatePipe(curve, r0, False, capmode, True, TOL, ANG)
    else:
        d = curve.Domain
        res = rg.Brep.CreatePipe(curve, [d.T0, d.T1], [r0, r1], True, capmode, True, TOL, ANG)
    return res[0] if res else None


def sphere(c, r):
    return rg.Sphere(c, r).ToBrep()


def spike(base, direction, height, r_base, r_tip=0.0):
    d = rg.Vector3d(direction)
    d.Unitize()
    apex = base + d * height
    perp = rg.Vector3d.CrossProduct(d, rg.Vector3d.ZAxis)
    if perp.Length < 1e-6:
        perp = rg.Vector3d.CrossProduct(d, rg.Vector3d.XAxis)
    perp.Unitize()
    pts = [base, base + perp * r_base]
    if r_tip > 0:
        pts.append(apex + perp * r_tip)
    pts.append(apex)
    prof = rg.PolylineCurve(pts)
    rev = rg.RevSurface.Create(prof, rg.Line(base, apex))
    return rg.Brep.CreateFromRevSurface(rev, False, False)


def cap(brep):
    if brep is None:
        return None
    if brep.IsSolid:
        return brep
    c = brep.CapPlanarHoles(TOL)
    return c if c is not None else brep


def loft(curves, closed=False, end_point=None, straight=False):
    lt = rg.LoftType.Straight if straight else rg.LoftType.Normal
    endp = end_point if end_point is not None else rg.Point3d.Unset
    res = rg.Brep.CreateFromLoft(curves, rg.Point3d.Unset, endp, lt, closed)
    return res[0] if res else None


def extrude_planar(curve, vector):
    srf = rg.Surface.CreateExtrusion(curve, vector)
    return cap(srf.ToBrep()) if srf else None


def boolean_diff(a, cutters):
    if a is None:
        return a
    try:
        res = rg.Brep.CreateBooleanDifference([a], cutters, TOL)
        if res and len(res) > 0:
            return list(res)
    except Exception as e:
        log("  boolean failed: %s" % e)
    return a


def superprofile(w, t, n_out, n_in, m=32):
    pts = []
    for i in range(m):
        phi = 2 * math.pi * i / m
        c, s = math.cos(phi), math.sin(phi)
        n = n_out if s >= 0 else n_in
        e = 2.0 / n
        b = (w / 2.0) * math.copysign(abs(c) ** e, c)
        a = t / 2.0 + (t / 2.0) * math.copysign(abs(s) ** e, s)
        pts.append((a, b))
    return pts


def resample(poly, n):
    segs = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        segs.append(math.hypot(q[0] - p[0], q[1] - p[1]))
    total = sum(segs)
    out, k, acc = [], 0, 0.0
    for i in range(n):
        target = total * i / float(n)
        while acc + segs[k] < target and k < len(segs) - 1:
            acc += segs[k]
            k += 1
        t = (target - acc) / segs[k] if segs[k] else 0
        p, q = poly[k], poly[(k + 1) % len(poly)]
        out.append((lerp(p[0], q[0], t), lerp(p[1], q[1], t)))
    return out


def offset_poly(poly, d):
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    out = []
    for i in range(n):
        a, b = poly[(i - 1) % n], poly[(i + 1) % n]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        tx, ty = tx / ln, ty / ln
        nx, ny = ty * sgn, -tx * sgn
        out.append((poly[i][0] + nx * d, poly[i][1] + ny * d))
    return out


# ------------------------------------------------------------------ stones
def stone_dims(cut, carat, gem="diamond"):
    ratio, w1, depth, table = CUTS.get(cut, CUTS["round"])
    k = (max(carat, 0.005) * 3.52 / GEM_DENSITY.get(gem, 3.52)) ** (1.0 / 3.0)
    w = w1 * k
    return w * ratio, w


def outline(cut, L, W, n=48):
    a, b = L / 2.0, W / 2.0

    def lens(ha, hb, z):
        R = (ha * ha + hb * hb) / (2 * hb)
        c = R - hb
        return max(0.0, math.sqrt(max(0.0, R * R - z * z)) - c)

    pts = []
    if cut in ("round", "oval"):
        for i in range(n):
            t = 2 * math.pi * i / n
            pts.append((b * math.sin(t), a * math.cos(t)))
        return pts
    if cut in ("cushion", "princess", "asscher", "radiant", "emerald"):
        e = 4.0 if cut == "cushion" else 30.0
        raw = []
        for i in range(400):
            t = 2 * math.pi * i / 400
            s, c = math.sin(t), math.cos(t)
            raw.append((b * math.copysign(abs(s) ** (2 / e), s), a * math.copysign(abs(c) ** (2 / e), c)))
        if cut in ("emerald", "asscher", "radiant"):
            k = min(a, b) * (0.22 if cut == "radiant" else 0.3)
            cut_pts = []
            for x, z in raw:
                ex, ez = abs(x) - (b - k), abs(z) - (a - k)
                if ex > 0 and ez > 0 and ex + ez > k:
                    s = k / (ex + ez)
                    cut_pts.append((math.copysign(b - k + ex * s, x), math.copysign(a - k + ez * s, z)))
                else:
                    cut_pts.append((x, z))
            raw = cut_pts
        return resample(raw, n)
    if cut == "marquise":
        raw = []
        for i in range(200):
            z = a * math.cos(2 * math.pi * i / 200)
            side = 1 if i < 100 else -1
            raw.append((side * lens(a, b, z), z))
        return resample(raw, n)
    if cut == "pear":
        ap = L - b
        right = [(lens(ap, b, ap * (1 - i / 100.0)), ap * (1 - i / 100.0)) for i in range(101)]
        rnd = [(b * math.cos(math.pi * i / 100.0), -b * math.sin(math.pi * i / 100.0)) for i in range(101)]
        left = [(-lens(ap, b, ap * i / 100.0), ap * i / 100.0) for i in range(101)]
        poly = right + rnd[1:] + left[1:-1]
        shift = (ap - b) / 2.0
        return resample([(x, z - shift) for x, z in poly], n)
    if cut == "heart":
        raw = []
        for i in range(400):
            t = 2 * math.pi * i / 400
            raw.append((16 * math.sin(t) ** 3, -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))))
        xs, zs = [p[0] for p in raw], [p[1] for p in raw]
        sx, sz = W / (max(xs) - min(xs)), L / (max(zs) - min(zs))
        cz = (max(zs) + min(zs)) / 2.0
        return resample([(x * sx, (z - cz) * sz) for x, z in raw], n)
    if cut == "trillion":
        R = W / math.sqrt(3)
        raw = []
        for k in range(3):
            a0, a1 = 2 * math.pi * k / 3, 2 * math.pi * (k + 1) / 3
            p0, p1 = (R * math.sin(a0), R * math.cos(a0)), (R * math.sin(a1), R * math.cos(a1))
            am = (a0 + a1) / 2
            for i in range(40):
                t = i / 40.0
                bulge = math.sin(t * math.pi) * R * 0.12
                raw.append((lerp(p0[0], p1[0], t) + math.sin(am) * bulge, lerp(p0[1], p1[1], t) + math.cos(am) * bulge))
        return resample(raw, n)
    return outline("round", L, W, n)


def stone_brep(cut, L, W, xf=None, n=32, grow=0.0):
    """Faceted gem (girdle centred at origin, table +Z, length along Y). Returns (brep, info)."""
    ratio, w1, depth, table = CUTS.get(cut, CUTS["round"])
    L, W = L + grow, W + grow
    ol = outline(cut, L, W, n)
    mind = min(L, W)
    crown = mind * (0.12 if cut in ("emerald", "asscher") else 0.15)
    gird = mind * 0.03
    pav = mind * depth - crown - gird

    def ring(scale, z):
        return polyline([P3(x * scale, y * scale, z) for x, y in ol])
    curves = [ring(table, gird / 2 + crown), ring(lerp(table, 1, 0.55), gird / 2 + crown * 0.55), ring(1, gird / 2), ring(1, -gird / 2), ring(0.55, -gird / 2 - pav * 0.55)]
    b = loft(curves, False, P3(0, 0, -gird / 2 - pav), straight=True)
    b = cap(b)
    if b is not None and xf is not None:
        b.Transform(xf)
    return b, {"outline": ol, "crown": crown, "girdle": gird, "pavilion": pav, "top": gird / 2 + crown, "culet": -gird / 2 - pav}


def prong_angles(cut, count):
    out = []
    corners = cut in ("cushion", "princess", "emerald", "asscher", "radiant")
    if cut == "trillion":
        out = [2 * math.pi * k / 3 for k in range(3)]
        if count >= 6:
            out += [2 * math.pi * (k + 0.5) / 3 for k in range(3)]
        return out
    if cut in ("pear", "heart"):
        out.append(0.0)
        rest = max(2, count - 1)
        spread = 1.9 if rest == 2 else 2.6
        for k in range(rest):
            out.append(math.pi + (k / float(rest - 1) - 0.5) * spread)
        return out
    if cut == "marquise":
        out += [0.0, math.pi]
        sides = max(0, (count - 2) // 2)
        for j in range(sides):
            a = math.pi / 2 + ((j + 0.5) / sides - 0.5) * 1.3
            out += [a, -a]
        return out
    off = math.pi / 4 if (corners or count == 4) else (0.0 if count == 6 else math.pi / count)
    return [off + 2 * math.pi * k / count for k in range(count)]


def rim_point(ol, ang):
    best, bd = ol[0], 9.0
    for p in ol:
        a = math.atan2(p[0], p[1])
        d = abs(a - ang) % (2 * math.pi)
        if d > math.pi:
            d = 2 * math.pi - d
        if d < bd:
            bd, best = d, p
    return best


def prong_dia_for(w):
    return 0.6 if w <= 3 else 0.75 if w <= 5 else 0.9 if w <= 7 else 1.05 if w <= 9 else 1.2


def build_head(cut, L, W, base_z, xf, head_type="prong", prong_count=4, prong_style="round", prong_dia=0.0, rails=1,
               halo_stone=1.3, halo_gap=0.15, seat=True, seat_overlap=0.18, bezel_wall=0.7, taper=0.62, gem="diamond"):
    """Head in local frame (girdle at z=0), transformed by xf. base_z (<0) = where it meets the body."""
    stone, info = stone_brep(cut, L, W)
    cutter, _ = stone_brep(cut, L, W, grow=0.06)
    ol = info["outline"]
    mind = min(L, W)
    pd = prong_dia if prong_dia > 0 else prong_dia_for(mind)
    pr = pd / 2.0
    metal = []

    def grow(p, d):
        r = math.hypot(p[0], p[1]) or 1
        return (p[0] * (r + d) / r, p[1] * (r + d) / r)

    if head_type in ("prong", "halo"):
        top = info["top"] * (0.75 if prong_style == "claw" else 0.62)
        prongs = []
        for ang in prong_angles(cut, prong_count):
            rp = grow(rim_point(ol, ang), pr - seat_overlap)
            bp = (rp[0] * taper, rp[1] * taper)
            rail = interp([P3(bp[0], bp[1], base_z - 0.4), P3(lerp(bp[0], rp[0], 0.55), lerp(bp[1], rp[1], 0.55), base_z * 0.45),
                           P3(rp[0], rp[1], 0), P3(rp[0] * 0.995, rp[1] * 0.995, top)])
            b = pipe(rail, pr * 0.82, pr)
            tipc = P3(rp[0] * 0.97, rp[1] * 0.97, top + pr * 0.15)
            if prong_style == "pointed":
                d = rg.Vector3d(-rp[0], -rp[1], 0)
                d.Unitize()
                d = d * 0.55 + rg.Vector3d.ZAxis
                tip = spike(tipc, d, pd * 1.5, pr * 1.02)
            else:
                tip = sphere(tipc, pr * 1.08)
            un = rg.Brep.CreateBooleanUnion([b, tip], TOL) if b is not None and tip is not None else None
            prongs.append(un[0] if un else b)
        if seat:
            prongs = [boolean_diff(p, [cutter]) for p in prongs]
        metal.append(("Metal::Head::Prongs", "Prong", prongs))
        rail_breps = []
        for r in range(int(rails)):
            f = 0.5 if rails == 1 else 0.35 + 0.4 * r
            z = lerp(base_z, 0, f) - (0.35 if r == rails - 1 else 0)
            s = lerp(taper, 1, f)
            pav_scale = 1 - (abs(z) - info["girdle"] / 2) / info["pavilion"]
            if z < 0 and pav_scale > s - 0.02:
                continue
            pts = [P3(grow(p, pr - seat_overlap)[0] * s, grow(p, pr - seat_overlap)[1] * s, z) for p in ol[::2]]
            rail_breps.append(pipe(interp(pts, True), pr * 0.72, capmode=CAP_NONE))
        if rail_breps:
            metal.append(("Metal::Head::Gallery", "Gallery rail", rail_breps))

    if head_type == "bezel":
        lip = min(0.35, mind * 0.06)
        z0 = max(base_z, -info["pavilion"] * 0.85)
        z1 = info["girdle"] / 2 + info["crown"] * 0.35
        outer = interp([P3(x, y, z0) for x, y in offset_poly(ol, bezel_wall)], True)
        inner = interp([P3(x, y, z0 - 0.01) for x, y in offset_poly(ol, -lip)], True)
        bo = extrude_planar(outer, rg.Vector3d(0, 0, z1 - z0))
        bi = extrude_planar(inner, rg.Vector3d(0, 0, z1 - z0 + 0.02))
        bez = boolean_diff(bo, [bi])
        if seat:
            bez = [boolean_diff(x, [cutter]) for x in (bez if isinstance(bez, list) else [bez])]
        metal.append(("Metal::Head::Bezel", "Bezel", bez))
        if base_z < z0 - 0.2:
            ped = interp([P3(x * 0.7, y * 0.7, base_z - 0.3) for x, y in offset_poly(ol, bezel_wall * 0.5)], True)
            metal.append(("Metal::Head::Bezel", "Bezel pedestal", [extrude_planar(ped, rg.Vector3d(0, 0, z0 - base_z + 0.5))]))

    stones = [("Stones::Center", "Center stone", [stone])]
    if head_type == "halo":
        off = halo_stone / 2 + halo_gap + 0.25 + (pr - seat_overlap) * 0.5
        ring = offset_poly(ol, off)
        per = sum(math.hypot(ring[(i + 1) % len(ring)][0] - ring[i][0], ring[(i + 1) % len(ring)][1] - ring[i][1]) for i in range(len(ring)))
        count = max(8, int(per // (halo_stone + halo_gap)))
        pts = resample(ring, count)
        hy = -info["girdle"] / 2 - 0.15
        melee, beads = [], []
        hs_info = None
        for i, (x, y) in enumerate(pts):
            b, hs_info = stone_brep("round", halo_stone, halo_stone, rg.Transform.Translation(x, y, hy), n=16)
            melee.append(b)
            x2, y2 = pts[(i + 1) % len(pts)]
            beads.append(sphere(P3((x + x2) / 2, (y + y2) / 2, hy + hs_info["top"] * 0.75), max(0.28, halo_stone * 0.24)))
        w = halo_stone / 2 + 0.3
        fo = interp([P3(x, y, hy - hs_info["pavilion"] - 0.1) for x, y in offset_poly(ring, w)], True)
        fi = interp([P3(x, y, hy - hs_info["pavilion"] - 0.11) for x, y in offset_poly(ring, -w)], True)
        frame = boolean_diff(extrude_planar(fo, rg.Vector3d(0, 0, hs_info["pavilion"] + 0.05)), [extrude_planar(fi, rg.Vector3d(0, 0, hs_info["pavilion"] + 0.1))])
        frames = frame if isinstance(frame, list) else [frame]
        frames = [boolean_diff(fr, melee) for fr in frames]
        metal.append(("Metal::Head::Halo", "Halo frame", frames))
        metal.append(("Metal::Head::Halo", "Halo bead", beads))
        stones.append(("Stones::Halo", "Halo melee", melee))
        log("Halo: %d x %.2f mm melee" % (count, halo_stone))

    for lay, name, items in metal + stones:
        flat = []
        for it in items:
            flat.extend(it if isinstance(it, list) else [it])
        for b in flat:
            if b is not None:
                b.Transform(xf)
        emit(flat, lay if lay.startswith("Stones") else lay, name, "stone" if lay.startswith("Stones") else "metal")
    cutter.Transform(xf)
    emit(cutter, "Cutters::Seat", "Stone cutter", "cutter")
    return info, pd


# ------------------------------------------------------------------ ring
def us_to_d(us):
    return 11.63 + 0.8128 * us


def build_ring():
    R = us_to_d(g("ringSize", 6.5)) / 2.0
    wt, wb = g("widthTop", 2.4), g("widthBottom", 2.0)
    tt, tb = g("thickTop", 1.9), g("thickBottom", 1.6)
    n_out, n_in = PROFILES.get(g("profile", "comfort"), PROFILES["comfort"])
    style = g("shankStyle", "classic")
    head = g("headType", "prong")

    def W(th):
        return lerp(wb, wt, ((1 + math.cos(th)) / 2) ** 1.6)

    def T(th):
        return lerp(tb, tt, ((1 + math.cos(th)) / 2) ** 1.6)

    def frame(th):
        n = rg.Vector3d(math.sin(th), 0, math.cos(th))
        return P3(R * math.sin(th), 0, R * math.cos(th)), n, rg.Vector3d(0, 1, 0)

    def section(th, w, t, off=0.0):
        p, n, b = frame(th)
        pts = [p + n * a + b * (bb + off) for a, bb in superprofile(w, t, n_out, n_in, 24)]
        return interp(pts, True)

    K = 36
    shanks = []
    if style in ("split", "bypass"):
        for side in (-1, 1):
            secs = []
            for k in range(K):
                th = 2 * math.pi * k / K
                op = smooth(0.55, 1.0, (1 + math.cos(th)) / 2)
                byp = math.sin(th) * 0.5 * W(th) * op if style == "bypass" else 0
                off = side * (W(th) / 4 + op * g("splitGap", 1.6) / 2) + side * byp
                secs.append(section(th, W(th) / 2, T(th), off))
            shanks.append(loft(secs, True))
    elif style == "twisted":
        for k in range(2):
            pts = []
            for i in range(240):
                th = 2 * math.pi * i / 240
                ph = th * g("twist", 2.5) * 2 + math.pi * k
                d = W(th) * 0.55
                rr = W(th) * 0.24
                p, n, b = frame(th)
                pts.append(p + n * (d / 2 + rr * 0.5 * (1 + math.cos(ph))) + b * (math.sin(ph) * rr))
            shanks.append(pipe(interp(pts, True), min(wt, wb) * 0.275, capmode=CAP_NONE))
    else:
        shanks.append(loft([section(2 * math.pi * k / K, W(2 * math.pi * k / K), T(2 * math.pi * k / K)) for k in range(K)], True))
    shanks = [cap(s) for s in shanks]

    # openwork windows
    if g("openwork", "none") != "none" and style != "twisted":
        cutters = []
        n = int(g("openCount", 10))
        for i in range(n):
            th = 2 * math.pi * (i + 0.5) / n
            if head != "none" and abs(math.atan2(math.sin(th), math.cos(th))) < math.radians(28):
                continue
            hz = W(th) * g("openSize", 0.55)
            ht = min(2 * math.pi * (R + T(th)) / n * 0.62, hz * (0.62 if g("openwork", "arch") == "arch" else 1))
            p, nrm, b = frame(th)
            tng = rg.Vector3d.CrossProduct(b, nrm)
            plane = rg.Plane(p - nrm * 1.0, tng, b)
            pts = window_pts(g("openwork", "arch"), ht, hz)
            crv = polyline([plane.PointAt(x, z) for x, z in pts])
            cutters.append(extrude_planar(crv, nrm * (T(th) + 2)))
        if cutters:
            emit(cutters, "Cutters::Openwork", "Window cutter", "cutter")
            new = []
            for s in shanks:
                r = boolean_diff(s, cutters)
                new.extend(r if isinstance(r, list) else [r])
            shanks = new
            log("Openwork: %d windows cut" % len(cutters))

    # under-shank hollow
    if g("backHollow", False) and style == "classic":
        span = math.radians(max(40, min(300, g("hollowSpan", 200))))
        a0, a1 = math.pi - span / 2, math.pi + span / 2
        secs = []
        for k in range(25):
            u = k / 24.0
            th = lerp(a0, a1, u)
            p, n, b = frame(th)
            hw = max(0.2, W(th) / 2 - g("hollowRail", 0.8))
            dep = max(0.02, g("hollowDepth", 0.5) * smooth(0, 0.12, min(u, 1 - u)))
            secs.append(polyline([p + n * -0.6 + b * -hw, p + n * dep + b * (-hw * 0.92), p + n * dep + b * (hw * 0.92), p + n * -0.6 + b * hw]))
        hc = cap(loft(secs, False, straight=False))
        emit(hc, "Cutters::Hollow", "Hollow cutter", "cutter")
        new = []
        for s in shanks:
            r = boolean_diff(s, [hc])
            new.extend(r if isinstance(r, list) else [r])
        shanks = new
        log("Under-shank hollow %.2f mm deep" % g("hollowDepth", 0.5))
    emit(shanks, "Metal::Shank", "Shank")

    # head
    outer_top = R + tt
    if head != "none":
        cut = g("cut", "round")
        if g("sizeMode", "carat") == "mm":
            L, Wd = g("stoneL", 6.4), g("stoneW", 6.4)
        else:
            L, Wd = stone_dims(cut, g("carat", 1.0), g("gem", "diamond"))
        _, info = stone_brep(cut, L, Wd)
        girdle_z = outer_top + g("galleryLift", 1.2) - info["culet"]
        # local head: length along Y (finger axis), table +Z
        xf = rg.Transform.Translation(0, 0, girdle_z)
        build_head(cut, L, Wd, -(girdle_z - outer_top) - 0.05, xf, head, int(g("prongCount", 4)), g("prongStyle", "round"),
                   g("prongDia", 0), int(g("rails", 1)), g("haloStone", 1.3), g("haloGap", 0.15), g("seatCut", True), gem=g("gem", "diamond"))
        log("Stone %s %.2f x %.2f mm, girdle at Z=%.2f" % (cut, L, Wd, girdle_z))
        if g("cathedral", False) and head != "bezel":
            hw = max(L, Wd) / 2.0
            arcs = []
            for sx in (-1, 1):
                for sz in (-1, 1):
                    th = sx * math.radians(38)
                    sh = P3(math.sin(th) * (R + T(th) * 0.6), sz * W(th) * 0.18, math.cos(th) * (R + T(th) * 0.6))
                    mid = P3(sx * hw * 0.95, sz * W(0) * 0.32, girdle_z + info["culet"] * 0.45 - 0.6)
                    top = P3(sx * hw * 0.55, sz * L * 0.22, girdle_z + info["culet"] * 0.38)
                    arcs.append(pipe(interp([sh, mid, top]), min(W(th), T(th)) * 0.32, 0.45))
            emit(arcs, "Metal::Shank::Cathedral", "Cathedral arch")

    # spikes
    n_sp = int(g("spikes", 0))
    if n_sp > 0:
        rows = int(g("spikeRows", 1))
        sp = []
        for row in range(rows):
            for i in range(n_sp):
                th = 2 * math.pi * (i + 0.5 + row * 0.5) / n_sp
                if head != "none" and abs(math.atan2(math.sin(th), math.cos(th))) < math.radians(22):
                    continue
                y = 0 if rows == 1 else (-1 if row == 0 else 1) * W(th) * 0.22
                p, n, b = frame(th)
                base = p + n * (T(th) - 0.25) + b * y
                sp.append(spike(base, n, g("spikeLen", 1.8) + 0.25, g("spikeBase", 1.1) / 2, 0.06))
        emit(sp, "Metal::Ornament::Spikes", "Spike")
        log("Spikes: %d (base %.2f mm)" % (len(sp), g("spikeBase", 1.1)))

    # milgrain
    if g("milgrain", False):
        beads = []
        n = int(2 * math.pi * R / 0.55)
        for i in range(n):
            th = 2 * math.pi * i / n
            if head != "none" and abs(math.atan2(math.sin(th), math.cos(th))) < math.radians(12):
                continue
            p, nn, b = frame(th)
            for s in (-1, 1):
                beads.append(sphere(p + nn * (T(th) * 0.55) + b * (s * W(th) / 2), 0.2))
        emit(beads, "Metal::Ornament::Milgrain", "Milgrain bead")

    # coils
    n_co = int(g("coils", 0))
    if n_co > 0:
        coils = []
        for i in range(n_co):
            th0 = 2 * math.pi * (i + 0.5) / n_co
            if head != "none" and abs(math.atan2(math.sin(th0), math.cos(th0))) < math.radians(25):
                continue
            r0 = min(W(th0), 3.2) * 0.42
            pts = []
            for k in range(41):
                a = k / 40.0 * 1.6 * 2 * math.pi
                rr = r0 * (1 - k / 48.0)
                th = th0 + math.cos(a) * rr / R
                p, n, b = frame(th)
                pts.append(p + n * (T(th) + 0.1) + b * (math.sin(a) * rr))
            coils.append(pipe(interp(pts), 0.42, 0.28))
        emit(coils, "Metal::Ornament::Coils", "Coil")


def window_pts(kind, ht, hz):
    pts = []
    if kind == "arch":
        R, rise = ht, 0.866 * ht
        k = min(rise, hz * 0.62) / rise
        zs = hz / 2 - rise * k
        pts += [(-ht / 2, -hz / 2), (ht / 2, -hz / 2)]
        for i in range(17):
            x = ht / 2 - i / 16.0 * ht / 2
            pts.append((x, zs + math.sqrt(max(0, R * R - (x - (ht / 2 - R)) ** 2)) * k))
        for i in range(1, 17):
            x = -i / 16.0 * ht / 2
            pts.append((x, zs + math.sqrt(max(0, R * R - (x + (ht / 2 - R)) ** 2)) * k))
        return pts
    for i in range(40):
        t = 2 * math.pi * i / 40
        c, s = math.cos(t), math.sin(t)
        if kind == "diamond":
            pts.append((math.copysign(c * c, c) * ht / 2, math.copysign(s * s, s) * hz / 2))
        elif kind == "quatrefoil":
            r = 0.72 + 0.28 * abs(math.cos(2 * t))
            pts.append((c * r * ht / 2, s * r * hz / 2))
        else:
            pts.append((c * ht / 2, s * hz / 2))
    return pts


# ------------------------------------------------------------------ pendant
def pendant_outline(shape, H, W):
    pts = []
    n = 160
    if shape == "circle":
        pts = [(math.sin(2 * math.pi * i / n), math.cos(2 * math.pi * i / n)) for i in range(n)]
    elif shape == "oval":
        pts = [(math.sin(2 * math.pi * i / n), math.cos(2 * math.pi * i / n)) for i in range(n)]
    elif shape == "teardrop":
        pts = [(math.sin(t) * math.sin(t / 2), math.cos(t)) for t in [2 * math.pi * i / n for i in range(n)]]
    elif shape == "heart":
        pts = [(16 * math.sin(t) ** 3, 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) for t in [2 * math.pi * i / n for i in range(n)]]
    elif shape == "hexagon":
        pts = [(math.sin(2 * math.pi * k / 6), math.cos(2 * math.pi * k / 6)) for k in range(6)]
    elif shape == "star":
        pts = [(math.sin(2 * math.pi * k / 10) * (0.45 if k % 2 else 1), math.cos(2 * math.pi * k / 10) * (0.45 if k % 2 else 1)) for k in range(10)]
    elif shape in ("cross", "gothic-cross"):
        a, arm, cy, k = 0.17, 0.66, 0.35, 1.6 * 0.17
        if shape == "cross":
            pts = [(-0.2, 1), (0.2, 1), (0.2, 0.34), (0.62, 0.34), (0.62, 0.09), (0.2, 0.09), (0.2, -1), (-0.2, -1), (-0.2, 0.09), (-0.62, 0.09), (-0.62, 0.34), (-0.2, 0.34)]
        else:
            pts = [(0, 1), (a, 1 - k), (a, cy + a), (arm - k, cy + a), (arm, cy), (arm - k, cy - a), (a, cy - a), (a, -1 + k), (0, -1),
                   (-a, -1 + k), (-a, cy - a), (-arm + k, cy - a), (-arm, cy), (-arm + k, cy + a), (-a, cy + a), (-a, 1 - k)]
    elif shape == "shield":
        for i in range(n):
            t = 2 * math.pi * i / n
            s, c = math.sin(t), math.cos(t)
            y = c ** 0.35 if c > 0 else -((-c) ** 1.3)
            pts.append((s * (1 if c > 0 else 1 + c * 0.55), y))
    elif shape == "cushion":
        for i in range(n):
            t = 2 * math.pi * i / n
            s, c = math.sin(t), math.cos(t)
            pts.append((math.copysign(abs(s) ** 0.5, s), math.copysign(abs(c) ** 0.5, c)))
    else:
        pts = [(math.sin(2 * math.pi * i / n), math.cos(2 * math.pi * i / n)) for i in range(n)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    sx, sy = W / (max(xs) - min(xs)), H / (max(ys) - min(ys))
    if shape == "circle":
        sx = sy = min(W, H) / (max(xs) - min(xs))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    poly = [((x - cx) * sx, (y - cy) * sy) for x, y in pts]
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    if area < 0:
        poly.reverse()
    sharp = shape in ("hexagon", "star", "cross", "gothic-cross")
    return poly, sharp


def build_pendant():
    H, Wd, t = g("height", 22), g("width", 15), g("thickness", 1.6)
    shape = g("shape", "teardrop")
    if shape == "custom" and PARAMS.get("customOutline"):
        poly, sharp = [tuple(p) for p in PARAMS["customOutline"]], True
    else:
        poly, sharp = pendant_outline(shape, H, Wd)

    # Front view: outline in XZ, thickness along Y (front face = -Y)
    def xz(pts, y):
        return [P3(x, y, z) for x, z in pts]
    crv = polyline(xz(poly, t / 2)) if sharp else interp(xz(poly, t / 2), True)
    body = extrude_planar(crv, rg.Vector3d(0, -t, 0))
    cutters = []
    stone_r = 0.0
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    head = g("headType", "bezel")
    if head != "none":
        cut = g("cut", "round")
        if g("sizeMode", "carat") == "mm":
            L, Wst = g("stoneL", 5), g("stoneW", 5)
        else:
            L, Wst = stone_dims(cut, g("carat", 0.5), g("gem", "diamond"))
        girdle = t / 2 + 0.35
        # local head (table +Z, length +Y) -> table towards -Y (front), length along +Z
        xf = rg.Transform.Translation(0, -girdle, g("stoneY", 0)) * rg.Transform.Rotation(math.pi / 2, rg.Vector3d.XAxis, rg.Point3d.Origin)
        info, _ = build_head(cut, L, Wst, -(girdle - (-t / 2 + 0.25)), xf, "halo" if head == "halo" else head, int(g("prongCount", 4)),
                             g("prongStyle", "round"), 0, 1, gem=g("gem", "diamond"))
        light = offset_poly(list(info["outline"]), -min(0.6, min(L, Wst) * 0.12))
        stone_r = max(L, Wst) / 2.0 + (2.5 if head == "halo" else 1.0)
        lc = polyline(xz([(x, z + g("stoneY", 0)) for x, z in light], t))
        cutters.append(extrude_planar(lc, rg.Vector3d(0, -2 * t, 0)))
    if g("openwork", "none") != "none":
        s, br, rim = g("openSize", 1.6), g("openBridge", 0.9), g("rim", 1.4)
        inner = offset_poly(poly, -rim)
        pitch = s + br
        y, row = min(ys), 0
        while y <= max(ys):
            x = min(xs)
            while x <= max(xs):
                cx = x + (pitch / 2 if row % 2 else 0)
                hole = [(cx + math.sin(2 * math.pi * i / 24) * s / 2, y + math.cos(2 * math.pi * i / 24) * s / 2) for i in range(24)]
                if all(point_in_poly(h, inner) for h in hole) and math.hypot(cx, y - g("stoneY", 0)) > stone_r + br + s / 2:
                    cutters.append(extrude_planar(polyline(xz(hole, t)), rg.Vector3d(0, -2 * t, 0)))
                x += pitch
            y += pitch
            row += 1
    if g("backHollow", False):
        inner = offset_poly(poly, -g("rim", 1.4))
        cav = polyline(xz(inner, t / 2 + 0.01)) if sharp else interp(xz(inner, t / 2 + 0.01), True)
        cutters.append(extrude_planar(cav, rg.Vector3d(0, -(t - g("frontWall", 0.7) + 0.01), 0)))
    if cutters:
        emit(cutters, "Cutters::Body", "Body cutter", "cutter")
        body = boolean_diff(body, cutters)
    emit(body, "Metal::Body", "Pendant body")
    if g("bail", "loop") != "none":
        top = max(p[1] for p in poly if abs(p[0]) < Wd * 0.08) if any(abs(p[0]) < Wd * 0.08 for p in poly) else max(ys)
        R = g("bailInner", 3.6) / 2 + g("bailWire", 1.1) / 2
        plane = rg.Plane(P3(0, 0, top + R - g("bailWire", 1.1) * 0.35), rg.Vector3d.YAxis, rg.Vector3d.ZAxis)
        emit(rg.Torus(plane, R, g("bailWire", 1.1) / 2).ToRevSurface().ToBrep(), "Metal::Findings::Bail", "Bail")
    n_sp = int(g("spikes", 0))
    if n_sp > 0:
        per = resample(poly, n_sp)
        sp = []
        for i, (x, z) in enumerate(per):
            x2, z2 = per[(i + 1) % n_sp]
            x0, z0 = per[(i - 1) % n_sp]
            nrm = rg.Vector3d(z2 - z0, 0, -(x2 - x0))
            nrm.Unitize()
            if nrm.X * x + nrm.Z * z < 0:
                nrm = -nrm
            sp.append(spike(P3(x, 0, z) - nrm * 0.4, nrm, g("spikeLen", 2) + 0.4, g("spikeBase", 1.2) / 2, 0.06))
        emit(sp, "Metal::Ornament::Spikes", "Spike")


def point_in_poly(pt, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > pt[1]) != (yj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


# ------------------------------------------------------------------ earrings / bangle / chain
def build_earring():
    et = g("earType", "stud")
    if et == "stud":
        cut = g("cut", "round")
        if g("sizeMode", "carat") == "mm":
            L, Wd = g("stoneL", 5), g("stoneW", 5)
        else:
            L, Wd = stone_dims(cut, g("carat", 0.5), g("gem", "diamond"))
        _, info = stone_brep(cut, L, Wd)
        base = info["culet"] - 1.0
        xf = rg.Transform.Rotation(math.pi / 2, rg.Vector3d.XAxis, rg.Point3d.Origin)   # table faces -Y (front view)
        build_head(cut, L, Wd, base, xf, g("headType", "prong"), int(g("prongCount", 4)), g("prongStyle", "round"), 0, 2, g("haloStone", 1.1), g("haloGap", 0.12), gem=g("gem", "diamond"))
        pr = min(L, Wd) * 0.38
        plate = rg.Cylinder(rg.Circle(rg.Plane(P3(0, -base - 0.2, 0), rg.Vector3d.YAxis), pr), 0.8).ToBrep(True, True)
        post = rg.Cylinder(rg.Circle(rg.Plane(P3(0, -base + 0.4, 0), rg.Vector3d.YAxis), g("postDia", 0.8) / 2), g("postLen", 10)).ToBrep(True, True)
        emit(plate, "Metal::Head::Gallery", "Base plate")
        emit(post, "Metal::Findings::Post", "Post")
    elif et == "hoop":
        R = g("hoopDia", 18) / 2 - g("hoopThick", 1.6)
        n_out, n_in = PROFILES.get(g("profile", "dome"), PROFILES["dome"])
        secs = []
        gap = math.radians(6)
        for k in range(37):
            th = lerp(gap / 2, 2 * math.pi - gap / 2, k / 36.0)
            p = P3(R * math.sin(th), 0, R * math.cos(th))
            n = rg.Vector3d(math.sin(th), 0, math.cos(th))
            b = rg.Vector3d(0, 1, 0)
            secs.append(interp([p + n * a + b * bb for a, bb in superprofile(g("hoopWidth", 2.5), g("hoopThick", 1.6), n_out, n_in, 24)], True))
        emit(cap(loft(secs)), "Metal::Body", "Hoop")
        r = R + g("hoopThick", 1.6) / 2
        pin = interp([P3(math.sin(-gap / 2) * r, 0, math.cos(-gap / 2) * r), P3(0, 0, r + 0.15), P3(math.sin(gap * 0.3) * r, 0, math.cos(gap * 0.3) * r)])
        emit(pipe(pin, g("postDia", 0.8) / 2), "Metal::Findings::Post", "Hinged post")
    else:
        PARAMS.update({"shape": g("dropShape", "teardrop"), "height": g("dropHeight", 14), "width": g("dropWidth", 9), "thickness": g("dropThick", 1.3), "bailInner": 1.6, "bailWire": 0.7})
        build_pendant()
        top = g("dropHeight", 14) / 2 + 2.2
        hook = interp([P3(0, 0, top), P3(0, 0, top + 4), P3(0, 3, top + 11), P3(0, 9, top + 13), P3(0, 14, top + 9), P3(0, 15, top + 2)])
        emit(pipe(hook, g("postDia", 0.8) / 2), "Metal::Findings::Hook", "Ear wire")


def build_bangle():
    a, b = g("innerW", 62) / 2, g("innerH", 54) / 2
    w, t = g("width", 6), g("thickness", 2.2)
    n_out, n_in = PROFILES.get(g("profile", "comfort"), PROFILES["comfort"])
    gap = g("cuffGap", 0) / a if g("cuffGap", 0) > 0 else 0
    K = 48
    secs = []
    rng = range(K) if gap == 0 else range(K + 1)
    for k in rng:
        th = (2 * math.pi * k / K) if gap == 0 else lerp(math.pi + gap / 2, 3 * math.pi - gap / 2, k / float(K))
        p = P3(a * math.sin(th), 0, b * math.cos(th))
        tng = rg.Vector3d(a * math.cos(th), 0, -b * math.sin(th))
        tng.Unitize()
        n = rg.Vector3d(-tng.Z, 0, tng.X)
        if n * rg.Vector3d(p) < 0:
            n = -n
        secs.append(interp([p + n * aa + rg.Vector3d(0, 1, 0) * bb for aa, bb in superprofile(w, t, n_out, n_in, 24)], True))
    body = loft(secs, gap == 0)
    emit(cap(body), "Metal::Body", "Cuff" if gap else "Bangle")
    if g("hinge", False) and gap == 0:
        kn, cl = 3, g("hingeClearance", 0.1)
        ln = (w - (kn - 1) * cl) / kn
        for i in range(kn):
            y0 = -w / 2 + i * (ln + cl)
            c = rg.Cylinder(rg.Circle(rg.Plane(P3(a + t * 0.5, y0, 0), rg.Vector3d.YAxis), t * 0.55), ln).ToBrep(True, True)
            emit(c, "Metal::Mechanism::Hinge", "Knuckle %d" % (i + 1))


def build_chain():
    d = g("wireDia", 0.8)
    li = g("linkInnerW", 2.0) if g("linkType", "cable") == "rolo" else g("linkInnerL", 3.2)
    wi = g("linkInnerW", 2.0)
    lc, wc = li + d, wi + d
    r = wc / 2
    st = max(0, lc - wc)
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        pts.append(P3(math.cos(t) * r + math.copysign(st / 2, math.cos(t)), math.sin(t) * r, 0))
    link = pipe(interp(pts, True), d / 2, capmode=CAP_NONE)
    count = int(math.ceil(g("lengthCm", 45) * 10 / li))
    show = min(count, 24)
    for i in range(show):
        b = link.DuplicateBrep()
        if i % 2:
            b.Transform(rg.Transform.Rotation(math.pi / 2, rg.Vector3d.XAxis, rg.Point3d.Origin))
        b.Transform(rg.Transform.Translation(i * li, 0, 0))
        emit(b, "Metal::Chain", "Link %d" % (i + 1))
    log("Chain: %d links total (%d modelled; ArrayCrv the rest along your neckline curve)" % (count, show))


# ------------------------------------------------------------------ main
def main():
    kind = PARAMS.get("type", "ring")
    log("Paloan Jewelry CAD Master - building %s" % kind)
    {"ring": build_ring, "pendant": build_pendant, "earring": build_earring, "bangle": build_bangle, "chain": build_chain}.get(kind, build_ring)()
    colors = {"metal": SD.Color.FromArgb(214, 175, 75), "stone": SD.Color.FromArgb(160, 210, 255), "cutter": SD.Color.FromArgb(230, 60, 60)}
    metal = [b for b, l, n, k in OUT if k == "metal" and b is not None]
    vol = 0.0
    try:
        un = rg.Brep.CreateBooleanUnion(metal, TOL) if len(metal) > 1 else metal
        for b in (un or metal):
            mp = rg.VolumeMassProperties.Compute(b)
            if mp:
                vol += abs(mp.Volume)
    except Exception:
        for b in metal:
            mp = rg.VolumeMassProperties.Compute(b)
            if mp:
                vol += abs(mp.Volume)
    dens = DENSITY.get(PARAMS.get("metal", "18ky"), 15.5)
    grams = vol * dens / 1000.0 * (2 if PARAMS.get("pair") and kind == "earring" else 1)
    log("Metal volume %.1f mm3 -> %.2f g %s" % (vol, grams, PARAMS.get("metal", "18ky")))
    naked = sum(1 for b, l, n, k in OUT if b is not None and k == "metal" and not b.IsSolid)
    log("Open (non-solid) metal parts: %d" % naked)
    if IN_GH:
        return
    for b, lay, name, k in OUT:
        if b is None:
            continue
        attr = Rhino.DocObjects.ObjectAttributes()
        attr.LayerIndex = layer_index("PJC::" + lay, colors.get(k))
        attr.Name = name
        DOC.Objects.AddBrep(b, attr)
    cut_idx = DOC.Layers.FindByFullPath("PJC::Cutters", -1)
    if cut_idx >= 0:
        lay = DOC.Layers[cut_idx]
        lay.IsVisible = False
        DOC.Layers.Modify(lay, cut_idx, True)
    DOC.Views.Redraw()


main()
if IN_GH:
    a = [b for b, l, n, k in OUT if b is not None and k != "cutter"]
    b = "\n".join(REPORT)
