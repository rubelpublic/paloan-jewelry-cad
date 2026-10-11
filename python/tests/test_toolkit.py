"""Tests for the pure-Python toolkit. Run: python python/tests/test_toolkit.py  (or pytest)."""
import io
import json
import math
import os
import struct
import sys
import tempfile
from contextlib import redirect_stdout

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from paloan_cad import core, checks, generators, mesh_analyzer  # noqa: E402
from paloan_cad.__main__ import main as cli  # noqa: E402
from paloan_cad.mesh import read_mesh, signed_volume, topology  # noqa: E402


def torus_mesh(R=9.0, r=1.0, nu=96, nv=24):
    verts, tris = [], []
    for i in range(nu):
        u = 2 * math.pi * i / nu
        for j in range(nv):
            v = 2 * math.pi * j / nv
            verts.append(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v)))
    for i in range(nu):
        for j in range(nv):
            a, b = i * nv + j, i * nv + (j + 1) % nv
            c, d = ((i + 1) % nu) * nv + j, ((i + 1) % nu) * nv + (j + 1) % nv
            tris += [(a, c, b), (b, c, d)]
    return verts, tris


def write_stl(path, verts, tris):
    with open(path, "wb") as fh:
        fh.write(b"\0" * 80 + struct.pack("<I", len(tris)))
        for a, b, c in tris:
            fh.write(struct.pack("<12fH", 0, 0, 0, *verts[a], *verts[b], *verts[c], 0))


def quiet(fn, *a):
    with redirect_stdout(io.StringIO()):
        return fn(*a)


def test_ring_size_roundtrip():
    for us in (3, 6.5, 10):
        assert abs(core.diameter_to_us(core.us_to_diameter(us)) - us) < 1e-9
    assert core.us_to_uk(6.5) == "M"
    assert round(core.us_to_diameter(7), 2) == 17.32


def test_stone_dims():
    L, W, D = core.stone_dims("round", 1.0)
    assert abs(L - 6.4) < 1e-6 and abs(W - 6.4) < 1e-6
    assert abs(core.carat_from_dims("oval", *core.stone_dims("oval", 2.0)[:2]) - 2.0) < 1e-6


def test_mesh_analyzer_torus():
    R, r = 9.0, 1.0
    v, t = torus_mesh(R, r)
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "ring.stl")
        write_stl(p, v, t)
        vv, tt = read_mesh(p)
        assert topology(vv, tt)["watertight"]
        rep = mesh_analyzer.analyze(vv, tt, "mm", "18ky", samples=300)
    exact = 2 * math.pi ** 2 * R * r * r
    assert abs(rep["volume_mm3"] - exact) / exact < 0.02, rep["volume_mm3"]
    assert rep["ring"] and abs(rep["ring"]["inner_diameter"] - 16.0) < 0.15, rep["ring"]
    assert 1.8 < rep["thickness"]["median"] < 2.05, rep["thickness"]


def test_checks():
    assert checks.spike_check(0.6, 3.0)["ok"] is False
    assert checks.spike_check(1.2, 2.0)["ok"] is True
    assert checks.joint_check("link", wire=0.8, inner_w=1.6)["ok"] is False
    assert checks.joint_check("hinge", clearance=0.1)["ok"] is True
    plan = checks.prong_plan("pear", 8.5, 5.5)
    assert plan["count"] == 5 and plan["angles_deg"][0] == 0.0
    s = checks.ring_hollow_saving(17, 4, 1.8, 0.6, metal="18ky")
    assert s["grams_saved"] > 0.2 and not s["checks"]
    assert checks.ring_hollow_saving(17, 4, 1.8, 1.4)["checks"][0]["level"] == "fail"
    t = checks.target_thickness_for_weight(17.0, 4.0, 5.0)
    g = core.grams(core.band_volume(17.0, 4.0, t), "18ky")
    assert abs(g - 5.0) < 0.01
    r = checks.check_design({"type": "ring", "thickBottom": 0.8, "thickTop": 1.8, "headType": "prong", "cut": "round", "carat": 1, "prongDia": 0.5})
    assert r["score"] < 80 and any(c["title"] == "Prongs undersized" for c in r["checks"])


def test_generators():
    path = generators.coil(2, 3, 0.6)
    v, t = generators.coil_tube_mesh(path)
    assert signed_volume(v, t) != 0 and topology(v, t)["watertight"]
    ol = generators.outline_shape("teardrop", 22, 15)
    lay = generators.openwork_layout(ol, 1.6, 0.9, 1.4, "hex", (0, 0, 3))
    assert lay["count"] > 5 and lay["bridge_check"] == "pass"


def test_relief_watertight():
    try:
        from PIL import Image
    except ImportError:
        return
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "h.png")
        img = Image.new("L", (40, 30))
        for x in range(40):
            for y in range(30):
                img.putpixel((x, y), int(127 + 127 * math.sin(x / 5.0) * math.cos(y / 4.0)))
        img.save(p)
        v, t = generators.relief_from_heightmap(p, 20, 15, 0.6, 0.8, res=40)
    topo = topology(v, t)
    assert topo["watertight"], topo
    vol = signed_volume(v, t)
    assert 20 * 15 * 0.8 < vol < 20 * 15 * 1.4, vol


def test_cli_tools():
    with tempfile.TemporaryDirectory() as d:
        design = os.path.join(d, "design.json")
        with open(design, "w") as fh:
            json.dump({"type": "ring", "params": {"metal": "18ky", "headType": "prong", "cut": "oval", "carat": 1.5, "thickBottom": 1.6, "thickTop": 1.9}}, fh)
        assert quiet(cli, ["manufacturing_checker", design]) == 0
        out = os.path.join(d, "x.py")
        assert quiet(cli, ["rhino_macro_generator", design, "-o", out]) == 0
        src = open(out, encoding="utf-8").read()
        compile(src, out, "exec")
        assert "PARAMS = _json.loads" in src
        assert quiet(cli, ["coil_generator", "-o", os.path.join(d, "c.obj")]) == 0
        assert quiet(cli, ["openwork_builder", "-o", os.path.join(d, "o.svg")]) == 0
        assert quiet(cli, ["stone_seat_generator", "--cut", "pear", "--carat", "1"]) == 0
        assert quiet(cli, ["prong_optimizer", "--cut", "marquise", "--carat", "1"]) == 0
        assert quiet(cli, ["joint_validator", "hinge", "--clearance", "0.1", "--width", "6"]) == 0
        assert quiet(cli, ["spike_stability_checker", "--base", "1.2", "--length", "2.4"]) == 0
        assert quiet(cli, ["backside_optimizer", "ring", "--depth", "0.5"]) == 0
        assert quiet(cli, ["measurement_validator", "--ring-size", "7"]) == 0
        assert quiet(cli, ["weight_estimator", "--band", "6.5", "4", "1.8", "--stone", "round", "1"]) == 0
        assert quiet(cli, ["grasshopper_builder", "-o", os.path.join(d, "gh.py")]) == 0
        assert quiet(cli, ["nurbs_cleaner", "-o", os.path.join(d, "nc.py")]) == 0
        v, t = torus_mesh()
        stl = os.path.join(d, "r.stl")
        write_stl(stl, v, t)
        assert quiet(cli, ["cad_rebuild_assistant", stl]) == 0
        assert quiet(cli, ["mesh_analyzer", stl]) == 0
        assert quiet(cli, ["wall_thickness_validator", stl]) == 0


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
            print("ok", name)
    print("%d toolkit tests passed" % n)
