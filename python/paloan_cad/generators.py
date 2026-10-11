"""Geometry generators: curling coils, openwork layouts, carved relief surfaces, rebuild plans."""
import math

from . import core
from .mesh import write_obj


# ---------------- coil_generator ----------------
def coil(turns=2.0, r_start=3.0, r_end=0.6, kind="archimedean", pitch_z=0.0, points=200):
    """Planar (or conical with pitch_z) spiral as a polyline [(x,y,z)]."""
    pts = []
    for i in range(points + 1):
        t = i / float(points)
        a = t * turns * 2 * math.pi
        if kind == "log":
            k = math.log(max(r_end, 1e-3) / r_start) / (turns * 2 * math.pi)
            r = r_start * math.exp(k * a)
        else:
            r = r_start + (r_end - r_start) * t
        pts.append((r * math.cos(a), r * math.sin(a), pitch_z * t))
    return pts


def coil_tube_mesh(path, r0=0.45, r1=0.3, radial=12):
    """Swept circular tube along a polyline (capped)."""
    verts, tris = [], []
    n = len(path)
    for i, p in enumerate(path):
        a, b = path[max(0, i - 1)], path[min(n - 1, i + 1)]
        t = [b[k] - a[k] for k in range(3)]
        L = math.sqrt(sum(x * x for x in t)) or 1
        t = [x / L for x in t]
        up = (0, 0, 1) if abs(t[2]) < 0.9 else (1, 0, 0)
        nx = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]
        Ln = math.sqrt(sum(x * x for x in nx)) or 1
        nx = [x / Ln for x in nx]
        bx = [t[1] * nx[2] - t[2] * nx[1], t[2] * nx[0] - t[0] * nx[2], t[0] * nx[1] - t[1] * nx[0]]
        r = r0 + (r1 - r0) * i / float(n - 1)
        for j in range(radial):
            ang = 2 * math.pi * j / radial
            verts.append(tuple(p[k] + (nx[k] * math.cos(ang) + bx[k] * math.sin(ang)) * r for k in range(3)))
    for i in range(n - 1):
        for j in range(radial):
            a, b = i * radial + j, i * radial + (j + 1) % radial
            c, d = a + radial, b + radial
            tris += [(a, c, b), (b, c, d)]
    for ring, flip in ((0, True), (n - 1, False)):
        ci = len(verts)
        verts.append(path[ring])
        for j in range(radial):
            a, b = ring * radial + j, ring * radial + (j + 1) % radial
            tris.append((ci, b, a) if flip else (ci, a, b))
    return verts, tris


# ---------------- openwork_builder ----------------
def outline_shape(shape, height, width, n=160):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        if shape == "teardrop":
            pts.append((math.sin(t) * math.sin(t / 2), math.cos(t)))
        elif shape == "heart":
            pts.append((16 * math.sin(t) ** 3, 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
        else:
            pts.append((math.sin(t), math.cos(t)))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    sx, sy = width / (max(xs) - min(xs)), height / (max(ys) - min(ys))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    return [((x - cx) * sx, (y - cy) * sy) for x, y in pts]


def _inside(pt, poly):
    inside, j = False, len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > pt[1]) != (yj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _dist(pt, poly):
    best = 1e9
    for i in range(len(poly)):
        (ax, ay), (bx, by) = poly[i - 1], poly[i]
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(pt[0] - ax - t * dx, pt[1] - ay - t * dy))
    return best


def openwork_layout(outline, hole=1.6, bridge=0.9, rim=1.4, pattern="hex", keep_out=None):
    """Grid of holes clipped to the outline. keep_out: (cx, cy, r) zone for a stone. Returns centres + stats."""
    pitch = hole + bridge
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    centres, row = [], 0
    y = min(ys)
    while y <= max(ys):
        x = min(xs)
        while x <= max(xs):
            cx = x + (pitch / 2 if (row % 2 and pattern == "hex") else 0)
            if _inside((cx, y), outline) and _dist((cx, y), outline) >= rim + hole / 2:
                if not keep_out or math.hypot(cx - keep_out[0], y - keep_out[1]) > keep_out[2] + hole / 2 + bridge:
                    centres.append((cx, y))
            x += pitch
        y += pitch * (0.866 if pattern == "hex" else 1.0)
        row += 1
    open_area = len(centres) * math.pi * (hole / 2) ** 2
    area = abs(sum(outline[i][0] * outline[i - 1][1] - outline[i - 1][0] * outline[i][1] for i in range(len(outline)))) / 2
    level = "fail" if bridge < core.RULES["bridge_fail"] else "warn" if bridge < core.RULES["bridge_warn"] else "pass"
    return {"centres": centres, "count": len(centres), "pitch": pitch, "open_fraction": open_area / area if area else 0,
            "bridge_check": level, "hole": hole, "bridge": bridge}


def layout_svg(outline, layout, path):
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    pad = 2
    w, h = max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad
    ox, oy = -min(xs) + pad, max(ys) + pad
    d = "M" + " L".join("%.3f %.3f" % (x + ox, oy - y) for x, y in outline) + " Z"
    holes = "".join('<circle cx="%.3f" cy="%.3f" r="%.3f"/>' % (x + ox, oy - y, layout["hole"] / 2) for x, y in layout["centres"])
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%.2fmm" height="%.2fmm" viewBox="0 0 %.3f %.3f">'
           '<path d="%s" fill="#d9b45a" stroke="#000" stroke-width="0.05"/><g fill="#fff" stroke="#000" stroke-width="0.03">%s</g></svg>') % (w, h, w, h, d, holes)
    with open(path, "w") as fh:
        fh.write(svg)


# ---------------- carving_surface_builder ----------------
def relief_from_heightmap(image_path, width_mm, height_mm, depth_mm=0.6, base_mm=0.8, res=160, invert=False):
    """Closed relief slab from a grayscale height map (requires Pillow). White = raised (popping carving)."""
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("carving_surface_builder needs Pillow: pip install pillow")
    img = Image.open(image_path).convert("L")
    ratio = img.height / float(img.width)
    nx, ny = res, max(2, int(res * ratio))
    img = img.resize((nx, ny))
    px = img.load()
    verts, tris = [], []
    for j in range(ny):
        for i in range(nx):
            v = px[i, j] / 255.0
            v = 1 - v if invert else v
            verts.append((i / (nx - 1) * width_mm - width_mm / 2, height_mm / 2 - j / (ny - 1) * height_mm, base_mm + v * depth_mm))
    top = len(verts)
    for j in range(ny):
        for i in range(nx):
            x, y, _ = verts[j * nx + i]
            verts.append((x, y, 0.0))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1
            tris += [(a, c, b), (b, c, d), (top + a, top + b, top + c), (top + b, top + d, top + c)]
    # side walls: walk the border clockwise seen from +Z (north edge west→east, east edge north→south, ...)
    ring = [i for i in range(nx)] + [j * nx + nx - 1 for j in range(1, ny)] + \
           [(ny - 1) * nx + i for i in range(nx - 2, -1, -1)] + [j * nx for j in range(ny - 2, 0, -1)]
    for k in range(len(ring)):
        p, q = ring[k], ring[(k + 1) % len(ring)]
        tris += [(p, q, top + p), (q, top + q, top + p)]
    return verts, tris


# ---------------- cad_rebuild_assistant ----------------
def rebuild_plan(r):
    """Prioritised Mesh -> NURBS plan from a mesh_analyzer report."""
    plan = []
    T = r["topology"]
    if r["triangles"] > 600000:
        plan.append((1, "Decimate", ["ReduceMesh to 150–250k triangles; keep the original on a locked Reference layer."]))
    if not T["watertight"]:
        plan.append((1, "Repair topology", ["%d naked edges / %d holes / %d non-manifold edges." % (T["naked_edges"], T["holes"], T["non_manifold_edges"]),
                                            "MeshRepair → ExtractNonManifoldMeshEdges → FillMeshHoles → UnifyMeshNormals → Weld 180°."]))
    if r["shells"] > 1:
        small = [s for s in r["shell_list"] if max(s["size"]) < max(r["bbox_mm"]) * 0.06]
        plan.append((2, "Segment shells", ["%d shells (%d tiny fragments to delete). SplitDisjointMesh, one layer per component." % (r["shells"], len(small))]))
    t = r["thickness"]
    if t["samples"] and t["thin_pct"] > 2:
        plan.append((1, "Thicken weak walls", ["%.1f%% of samples below %.2f mm (min %.2f mm). OffsetSrf solid or rebuild at ≥ 0.6 mm gold / 0.8 mm silver." % (t["thin_pct"], t["min_wall"], t["min"])]))
    plan.append((3, "Smooth body → QuadRemesh → SubD → NURBS", ["QuadRemesh edge length 0.4–0.8 mm, Adaptive 50, detect hard edges, then ToSubD and ToNURBS; Check for naked edges."]))
    plan.append((2, "Detail → manual NURBS", ["Prongs: Pipe on centre curves + sphere tips; seats via BooleanDifference with a +0.06 mm gem cutter.",
                                              "Spikes: Revolve profile, base ≥ 1.0 mm. Filigree/coils: curves on surface + Pipe 0.6–0.8 mm.",
                                              "Carving: clean base surface + displacement from a baked height map (carving_surface_builder)."]))
    if r.get("ring"):
        plan.append((2, "Ring sizing", ["Hole Ø %.2f mm → US %.2f. Rebuild the shank on a true circle (rhino_macro_generator)." % (r["ring"]["inner_diameter"], r["ring"]["us_size"])]))
    plan.append((5, "Production checks", ["Join, Check, ShowEdges = 0 naked; Volume vs weight estimate; STL at 0.005 mm tolerance."]))
    plan.sort(key=lambda x: x[0])
    lines = ["# Mesh → NURBS rebuild plan", ""]
    for i, (_, title, steps) in enumerate(plan, 1):
        lines.append("## %d. %s" % (i, title))
        lines += ["- " + s for s in steps]
        lines.append("")
    return "\n".join(lines)


def save_obj(path, verts, tris, lines=None):
    write_obj(path, verts, tris, lines)
