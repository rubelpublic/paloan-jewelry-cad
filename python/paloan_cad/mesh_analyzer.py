"""mesh_analyzer — analyse a jewelry mesh (STL/OBJ): topology, shells, volume, weight, wall thickness,
ring size and rebuild zones. Usage: python -m paloan_cad mesh_analyzer model.stl [--unit mm] [--metal 18ky] [--json]"""
import argparse
import json
import math

from . import core
from .mesh import read_mesh, topology, components, signed_volume, area, bbox, RayGrid, vertex_normals, sub, norm

UNITS = {"mm": 1.0, "cm": 10.0, "m": 1000.0, "in": 25.4}


def guess_unit(verts):
    lo, hi = bbox(verts)
    m = max(hi[k] - lo[k] for k in range(3))
    return "m" if m < 0.2 else "in" if m < 1.2 else "cm" if m < 6 else "mm"


def analyze(verts, tris, unit="mm", metal="18ky", min_wall=0.6, samples=1500):
    s = UNITS[unit]
    verts = [(x * s, y * s, z * s) for x, y, z in verts]
    topo = topology(verts, tris)
    comps, find = components(verts, tris)
    vol = abs(signed_volume(verts, tris))
    lo, hi = bbox(verts)
    size = [hi[k] - lo[k] for k in range(3)]
    shells = []
    for ci, ts in enumerate(comps[:100]):
        cv = abs(signed_volume(verts, [tris[t] for t in ts]))
        vs = [verts[i] for t in ts for i in tris[t]]
        clo, chi = bbox(vs)
        shells.append({"id": ci + 1, "triangles": len(ts), "volume": cv, "size": [chi[k] - clo[k] for k in range(3)]})
    # wall thickness by inward rays
    grid = RayGrid(verts, tris)
    normals = vertex_normals(verts, tris)
    step = max(1, len(verts) // samples)
    th = []
    for i in range(0, len(verts), step):
        n = normals[i]
        d = (-n[0], -n[1], -n[2])
        o = (verts[i][0] + d[0] * 1e-4, verts[i][1] + d[1] * 1e-4, verts[i][2] + d[2] * 1e-4)
        h = grid.first_hit(o, d, max(size))
        if h is not None:
            th.append(h)
    th.sort()
    thin = sum(1 for t in th if t < min_wall)
    report = {
        "unit": unit, "bbox_mm": size, "triangles": len(tris), "vertices": len(verts), "topology": topo,
        "shells": len(comps), "shell_list": shells, "volume_mm3": vol, "area_mm2": area(verts, tris),
        "weights_g": {k: core.grams(vol, k) for k in core.METALS}, "metal": metal, "grams": core.grams(vol, metal),
        "thickness": {"samples": len(th), "min": th[0] if th else None, "p05": th[len(th) // 20] if th else None,
                      "median": th[len(th) // 2] if th else None, "thin_pct": 100.0 * thin / len(th) if th else 0.0, "min_wall": min_wall},
    }
    report["ring"] = detect_ring(verts, grid, lo, hi)
    report["volume_reliable"] = topo["watertight"]
    return report


def detect_ring(verts, grid, lo, hi):
    """Look for a finger hole along each axis; returns inner diameter and US size."""
    c = [(lo[k] + hi[k]) / 2 for k in range(3)]
    for axis in (2, 1, 0):
        u, v = [k for k in range(3) if k != axis]
        cx, cy = c[u], c[v]
        for _ in range(4):
            pts, ds = [], []
            for k in range(48):
                a = 2 * math.pi * k / 48
                d = [0.0, 0.0, 0.0]
                d[u], d[v] = math.cos(a), math.sin(a)
                o = list(c)
                o[u], o[v] = cx, cy
                h = grid.first_hit(tuple(o), tuple(d), 40)
                if h is not None:
                    ds.append(h)
                    pts.append((cx + d[u] * h, cy + d[v] * h))
            if len(pts) < 44:
                break
            ncx = sum(p[0] for p in pts) / len(pts)
            ncy = sum(p[1] for p in pts) / len(pts)
            moved = math.hypot(ncx - cx, ncy - cy)
            cx, cy = ncx, ncy
            if moved < 0.005:
                break
        if len(ds) >= 44:
            ds.sort()
            r = ds[len(ds) // 2]
            if 6 < r < 12:
                return {"axis": "xyz"[axis], "inner_diameter": 2 * r, "us_size": core.diameter_to_us(2 * r),
                        "eu_size": math.pi * 2 * r, "uk_size": core.us_to_uk(core.diameter_to_us(2 * r))}
    return None


def print_report(r):
    f = core.fmt
    print("Bounding box : %s mm" % " x ".join(f(x) for x in r["bbox_mm"]))
    print("Triangles    : %d   shells: %d   watertight: %s" % (r["triangles"], r["shells"], r["topology"]["watertight"]))
    print("Naked edges  : %d (%d holes)   non-manifold: %d   degenerate: %d" % (
        r["topology"]["naked_edges"], r["topology"]["holes"], r["topology"]["non_manifold_edges"], r["topology"]["degenerate"]))
    print("Volume       : %s mm3 %s" % (f(r["volume_mm3"], 1), "" if r["volume_reliable"] else "(mesh open - approximate)"))
    print("Weight       : " + "  ".join("%s %s g" % (k, f(v)) for k, v in r["weights_g"].items()))
    t = r["thickness"]
    if t["samples"]:
        print("Thickness    : min %s  p05 %s  median %s mm  (%.1f%% below %s mm)" % (f(t["min"]), f(t["p05"]), f(t["median"]), t["thin_pct"], t["min_wall"]))
    if r["ring"]:
        print("Ring         : inner %s mm -> US %s / UK %s / EU %s" % (f(r["ring"]["inner_diameter"]), f(r["ring"]["us_size"]), r["ring"]["uk_size"], f(r["ring"]["eu_size"], 1)))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mesh_analyzer", description=__doc__)
    ap.add_argument("mesh")
    ap.add_argument("--unit", default="auto", choices=["auto"] + list(UNITS))
    ap.add_argument("--metal", default="18ky", choices=list(core.METALS))
    ap.add_argument("--min-wall", type=float, default=0.6)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    verts, tris = read_mesh(a.mesh)
    unit = guess_unit(verts) if a.unit == "auto" else a.unit
    r = analyze(verts, tris, unit, a.metal, a.min_wall)
    if a.json:
        print(json.dumps(r, indent=1))
    else:
        print_report(r)
    return r
