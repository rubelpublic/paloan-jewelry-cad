"""Mesh I/O and geometry kernels (pure Python): STL (ascii/binary) and OBJ readers, welding,
topology, volume, area, components, a uniform-grid ray caster for wall thickness."""
import math
import struct


def read_mesh(path):
    """Return (vertices[list of (x,y,z)], triangles[list of (i,j,k)])."""
    low = path.lower()
    if low.endswith(".stl"):
        return _read_stl(path)
    if low.endswith(".obj"):
        return _read_obj(path)
    raise ValueError("Unsupported mesh format (use STL or OBJ; convert GLB/FBX in Blender or the web Mesh Lab)")


def _read_stl(path):
    with open(path, "rb") as fh:
        data = fh.read()
    tris = []
    if len(data) >= 84:
        n = struct.unpack("<I", data[80:84])[0]
        if 84 + n * 50 == len(data):
            for i in range(n):
                off = 84 + i * 50 + 12
                v = struct.unpack("<9f", data[off:off + 36])
                tris.append((v[0:3], v[3:6], v[6:9]))
            return weld(tris)
    text = data.decode("utf-8", "ignore")
    cur = []
    for line in text.splitlines():
        parts = line.strip().split()
        if parts[:1] == ["vertex"]:
            cur.append(tuple(float(x) for x in parts[1:4]))
            if len(cur) == 3:
                tris.append(tuple(cur))
                cur = []
    return weld(tris)


def _read_obj(path):
    verts, faces = [], []
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                verts.append(tuple(float(x) for x in line.split()[1:4]))
            elif line.startswith("f "):
                idx = [int(p.split("/")[0]) for p in line.split()[1:]]
                idx = [i - 1 if i > 0 else len(verts) + i for i in idx]
                for k in range(1, len(idx) - 1):
                    faces.append((idx[0], idx[k], idx[k + 1]))
    return weld([(verts[a], verts[b], verts[c]) for a, b, c in faces])


def weld(tris, tol=1e-5):
    """Merge coincident vertices of a triangle soup."""
    index, verts, out = {}, [], []
    inv = 1.0 / tol
    for tri in tris:
        ids = []
        for p in tri:
            key = (round(p[0] * inv), round(p[1] * inv), round(p[2] * inv))
            if key not in index:
                index[key] = len(verts)
                verts.append(tuple(p))
            ids.append(index[key])
        out.append(tuple(ids))
    return verts, out


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    return math.sqrt(dot(a, a))


def signed_volume(verts, tris):
    v = 0.0
    for i, j, k in tris:
        v += dot(verts[i], cross(verts[j], verts[k]))
    return v / 6.0


def area(verts, tris):
    return sum(norm(cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]))) / 2 for i, j, k in tris)


def bbox(verts):
    xs, ys, zs = zip(*verts)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def topology(verts, tris):
    edges = {}
    for t, (a, b, c) in enumerate(tris):
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            edges.setdefault(key, []).append(t)
    naked = [e for e, ts in edges.items() if len(ts) == 1]
    nonman = [e for e, ts in edges.items() if len(ts) > 2]
    # boundary loops
    adj = {}
    for u, v in naked:
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)
    seen, holes = set(), 0
    for s in adj:
        if s in seen:
            continue
        holes += 1
        stack = [s]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            stack.extend(y for y in adj[x] if y not in seen)
    degenerate = sum(1 for i, j, k in tris if norm(cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]))) < 1e-12)
    return {"edges": len(edges), "naked_edges": len(naked), "non_manifold_edges": len(nonman), "holes": holes,
            "degenerate": degenerate, "watertight": not naked and not nonman}


def components(verts, tris):
    parent = list(range(len(verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b, c in tris:
        ra = find(a)
        for v in (b, c):
            rv = find(v)
            if rv != ra:
                parent[rv] = ra
    groups = {}
    for t, (a, b, c) in enumerate(tris):
        groups.setdefault(find(a), []).append(t)
    return sorted(groups.values(), key=len, reverse=True), find


class RayGrid:
    """Uniform grid acceleration for ray / triangle queries (Möller–Trumbore)."""

    def __init__(self, verts, tris, cells=48):
        self.v, self.t = verts, tris
        (x0, y0, z0), (x1, y1, z1) = bbox(verts)
        self.o = (x0 - 1e-6, y0 - 1e-6, z0 - 1e-6)
        size = max(x1 - x0, y1 - y0, z1 - z0) or 1.0
        self.h = size / cells
        self.cells = {}
        for ti, (a, b, c) in enumerate(tris):
            pa, pb, pc = verts[a], verts[b], verts[c]
            lo = [int((min(pa[k], pb[k], pc[k]) - self.o[k]) / self.h) for k in range(3)]
            hi = [int((max(pa[k], pb[k], pc[k]) - self.o[k]) / self.h) for k in range(3)]
            for i in range(lo[0], hi[0] + 1):
                for j in range(lo[1], hi[1] + 1):
                    for k in range(lo[2], hi[2] + 1):
                        self.cells.setdefault((i, j, k), []).append(ti)

    def first_hit(self, origin, direction, max_dist):
        """Distance to the first triangle hit (or None), marching cells along the ray."""
        step = self.h * 0.5
        tested, best = set(), None
        d = 0.0
        while d <= max_dist + self.h:
            p = (origin[0] + direction[0] * d, origin[1] + direction[1] * d, origin[2] + direction[2] * d)
            key = tuple(int((p[k] - self.o[k]) / self.h) for k in range(3))
            for ti in self.cells.get(key, ()):
                if ti in tested:
                    continue
                tested.add(ti)
                hit = _ray_tri(origin, direction, *(self.v[x] for x in self.t[ti]))
                if hit is not None and hit > 1e-6 and (best is None or hit < best):
                    best = hit
            if best is not None and best < d - self.h:
                return best
            d += step
        return best


def _ray_tri(o, d, a, b, c):
    e1, e2 = sub(b, a), sub(c, a)
    p = cross(d, e2)
    det = dot(e1, p)
    if abs(det) < 1e-12:
        return None
    inv = 1.0 / det
    s = sub(o, a)
    u = dot(s, p) * inv
    if u < 0 or u > 1:
        return None
    q = cross(s, e1)
    v = dot(d, q) * inv
    if v < 0 or u + v > 1:
        return None
    return dot(e2, q) * inv


def vertex_normals(verts, tris):
    n = [[0.0, 0.0, 0.0] for _ in verts]
    for a, b, c in tris:
        fn = cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]))
        for i in (a, b, c):
            n[i][0] += fn[0]
            n[i][1] += fn[1]
            n[i][2] += fn[2]
    out = []
    for x in n:
        L = norm(x) or 1.0
        out.append((x[0] / L, x[1] / L, x[2] / L))
    return out


def write_obj(path, verts, tris, polylines=None):
    with open(path, "w") as fh:
        fh.write("# Paloan Jewelry CAD toolkit\n")
        for v in verts:
            fh.write("v %.6f %.6f %.6f\n" % v)
        for a, b, c in tris:
            fh.write("f %d %d %d\n" % (a + 1, b + 1, c + 1))
        base = len(verts)
        for line in polylines or []:
            for p in line:
                fh.write("v %.6f %.6f %.6f\n" % tuple(p))
            fh.write("l " + " ".join(str(base + i + 1) for i in range(len(line))) + "\n")
            base += len(line)
