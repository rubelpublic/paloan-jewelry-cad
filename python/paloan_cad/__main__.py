"""Paloan Jewelry CAD toolkit — command line.

  python -m paloan_cad <tool> [options]      (python -m paloan_cad <tool> -h for help)

Tools: mesh_analyzer, cad_rebuild_assistant, manufacturing_checker, stone_seat_generator, prong_optimizer,
wall_thickness_validator, joint_validator, spike_stability_checker, coil_generator, openwork_builder,
carving_surface_builder, backside_optimizer, measurement_validator, weight_estimator, nurbs_cleaner,
grasshopper_builder, rhino_macro_generator
"""
import argparse
import json
import os
import sys

from . import core, checks, generators, mesh_analyzer
from .mesh import read_mesh

HERE = os.path.dirname(os.path.abspath(__file__))
RHINO_DIR = os.path.join(HERE, "..", "rhino")


def _print(obj):
    print(json.dumps(obj, indent=1, ensure_ascii=False, default=str))


def _checks(cs):
    for c in cs:
        print("[%s] %s — %s%s" % (c["level"].upper(), c["title"], c["detail"], ("  → " + c["fix"]) if c.get("fix") else ""))


def t_manufacturing(argv):
    ap = argparse.ArgumentParser(prog="manufacturing_checker", description="Validate a design JSON (web-app export or hand written).")
    ap.add_argument("design", help="JSON file with type + parameters")
    a = ap.parse_args(argv)
    with open(a.design, encoding="utf-8") as fh:
        d = json.load(fh)
    d = dict(d.get("params", {}), type=d.get("type", "ring")) if "params" in d else d
    r = checks.check_design(d)
    _checks(r["checks"])
    print("Score: %d/100" % r["score"])
    return r


def t_seat(argv):
    ap = argparse.ArgumentParser(prog="stone_seat_generator")
    ap.add_argument("--cut", default="round", choices=list(core.CUTS))
    ap.add_argument("--carat", type=float)
    ap.add_argument("--length", type=float)
    ap.add_argument("--width", type=float)
    ap.add_argument("--gem", default="diamond", choices=list(core.GEMS))
    ap.add_argument("--setting", default="prong", choices=["prong", "bezel", "pave"])
    a = ap.parse_args(argv)
    if a.carat is None and a.length is None:
        ap.error("give --carat or --length/--width")
    r = checks.seat_spec(a.cut, a.length, a.width or a.length, a.carat, a.gem, a.setting)
    _print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()})
    return r


def t_prong(argv):
    ap = argparse.ArgumentParser(prog="prong_optimizer")
    ap.add_argument("--cut", default="round", choices=list(core.CUTS))
    ap.add_argument("--carat", type=float, default=1.0)
    ap.add_argument("--length", type=float)
    ap.add_argument("--width", type=float)
    ap.add_argument("--count", type=int)
    ap.add_argument("--metal", default="18ky", choices=list(core.METALS))
    a = ap.parse_args(argv)
    L, W = (a.length, a.width or a.length) if a.length else core.stone_dims(a.cut, a.carat)[:2]
    r = checks.prong_plan(a.cut, L, W, a.count, a.metal)
    _print(r)
    return r


def t_thickness(argv):
    ap = argparse.ArgumentParser(prog="wall_thickness_validator")
    ap.add_argument("mesh")
    ap.add_argument("--unit", default="auto")
    ap.add_argument("--min-wall", type=float, default=0.6)
    a = ap.parse_args(argv)
    v, t = read_mesh(a.mesh)
    unit = mesh_analyzer.guess_unit(v) if a.unit == "auto" else a.unit
    r = mesh_analyzer.analyze(v, t, unit, min_wall=a.min_wall)["thickness"]
    _print(r)
    print("RESULT:", "FAIL" if r["thin_pct"] > 2 else "WARN" if r["thin_pct"] > 0 else "PASS")
    return r


def t_joint(argv):
    ap = argparse.ArgumentParser(prog="joint_validator")
    ap.add_argument("kind", choices=["hinge", "link", "jumpring"])
    ap.add_argument("--clearance", type=float, default=0.1)
    ap.add_argument("--wire", type=float, default=0.8)
    ap.add_argument("--inner-w", type=float, default=2.0)
    ap.add_argument("--inner-l", type=float, default=3.2)
    ap.add_argument("--width", type=float)
    ap.add_argument("--knuckles", type=int, default=3)
    a = ap.parse_args(argv)
    r = checks.joint_check(a.kind, a.clearance, a.wire, a.inner_w, a.inner_l, a.knuckles, a.width)
    _print(r)
    return r


def t_spike(argv):
    ap = argparse.ArgumentParser(prog="spike_stability_checker")
    ap.add_argument("--base", type=float, required=True)
    ap.add_argument("--length", type=float, required=True)
    ap.add_argument("--metal", default="18ky", choices=list(core.METALS))
    ap.add_argument("--tip-radius", type=float, default=0.12)
    a = ap.parse_args(argv)
    r = checks.spike_check(a.base, a.length, a.metal, a.tip_radius)
    _print(r)
    return r


def t_coil(argv):
    ap = argparse.ArgumentParser(prog="coil_generator")
    ap.add_argument("--turns", type=float, default=2.0)
    ap.add_argument("--r-start", type=float, default=3.0)
    ap.add_argument("--r-end", type=float, default=0.6)
    ap.add_argument("--kind", default="archimedean", choices=["archimedean", "log"])
    ap.add_argument("--pitch-z", type=float, default=0.0)
    ap.add_argument("--wire", type=float, default=0.8, help="start wire diameter (tapers to 70%%)")
    ap.add_argument("-o", "--out", default="coil.obj")
    a = ap.parse_args(argv)
    path = generators.coil(a.turns, a.r_start, a.r_end, a.kind, a.pitch_z)
    v, t = generators.coil_tube_mesh(path, a.wire / 2, a.wire * 0.35)
    generators.save_obj(a.out, v, t, [path])
    print("wrote %s (%d triangles, centre-line included as polyline). Wire end Ø %.2f mm%s" % (
        a.out, len(t), a.wire * 0.7, "  WARNING: < 0.6 mm is fragile" if a.wire * 0.7 < 0.6 else ""))
    return a.out


def t_openwork(argv):
    ap = argparse.ArgumentParser(prog="openwork_builder")
    ap.add_argument("--shape", default="circle", choices=["circle", "teardrop", "heart"])
    ap.add_argument("--height", type=float, default=22)
    ap.add_argument("--width", type=float, default=15)
    ap.add_argument("--hole", type=float, default=1.6)
    ap.add_argument("--bridge", type=float, default=0.9)
    ap.add_argument("--rim", type=float, default=1.4)
    ap.add_argument("--pattern", default="hex", choices=["hex", "grid"])
    ap.add_argument("--stone", type=float, default=0, help="keep-out diameter for a centre stone")
    ap.add_argument("-o", "--out", default="openwork.svg")
    a = ap.parse_args(argv)
    ol = generators.outline_shape(a.shape, a.height, a.width)
    lay = generators.openwork_layout(ol, a.hole, a.bridge, a.rim, a.pattern, (0, 0, a.stone / 2) if a.stone else None)
    generators.layout_svg(ol, lay, a.out)
    print("%d holes, %.0f%% open, bridge check %s → %s (import into Rhino, ExtrudeCrv, BooleanDifference)" % (
        lay["count"], lay["open_fraction"] * 100, lay["bridge_check"].upper(), a.out))
    return lay


def t_carving(argv):
    ap = argparse.ArgumentParser(prog="carving_surface_builder")
    ap.add_argument("heightmap")
    ap.add_argument("--width", type=float, default=20)
    ap.add_argument("--height", type=float, default=20)
    ap.add_argument("--depth", type=float, default=0.6, help="relief depth (popping carving)")
    ap.add_argument("--base", type=float, default=0.8, help="solid base thickness")
    ap.add_argument("--res", type=int, default=160)
    ap.add_argument("--invert", action="store_true")
    ap.add_argument("-o", "--out", default="relief.obj")
    a = ap.parse_args(argv)
    v, t = generators.relief_from_heightmap(a.heightmap, a.width, a.height, a.depth, a.base, a.res, a.invert)
    generators.save_obj(a.out, v, t)
    from .mesh import signed_volume
    vol = abs(signed_volume(v, t))
    print("wrote %s: %d triangles, volume %.1f mm3 (%.2f g 18K). Use as a displacement source or Boolean onto your base." % (
        a.out, len(t), vol, core.grams(vol, "18ky")))
    return a.out


def t_backside(argv):
    ap = argparse.ArgumentParser(prog="backside_optimizer")
    ap.add_argument("kind", choices=["ring", "pendant", "band-target"])
    ap.add_argument("--size", type=float, default=6.5, help="US ring size")
    ap.add_argument("--width", type=float, default=4)
    ap.add_argument("--thickness", type=float, default=1.8)
    ap.add_argument("--depth", type=float, default=0.6)
    ap.add_argument("--rail", type=float, default=0.8)
    ap.add_argument("--span", type=float, default=200)
    ap.add_argument("--area", type=float, help="pendant outline area mm2")
    ap.add_argument("--perimeter", type=float, help="pendant perimeter mm")
    ap.add_argument("--front-wall", type=float, default=0.7)
    ap.add_argument("--target", type=float, help="band-target: grams")
    ap.add_argument("--metal", default="18ky", choices=list(core.METALS))
    a = ap.parse_args(argv)
    if a.kind == "ring":
        r = checks.ring_hollow_saving(core.us_to_diameter(a.size), a.width, a.thickness, a.depth, a.rail, a.span, a.metal)
    elif a.kind == "pendant":
        if not (a.area and a.perimeter):
            ap.error("pendant needs --area and --perimeter")
        r = checks.pendant_hollow_saving(a.area, a.thickness, a.front_wall, a.rail, a.perimeter, a.metal)
    else:
        r = {"thickness": checks.target_thickness_for_weight(core.us_to_diameter(a.size), a.width, a.target, a.metal)}
    _print(r)
    return r


def t_measure(argv):
    ap = argparse.ArgumentParser(prog="measurement_validator")
    ap.add_argument("--ring-size", type=float)
    ap.add_argument("--diameter", type=float)
    ap.add_argument("--spec", help="JSON {dim: mm} requested")
    ap.add_argument("--actual", help="JSON {dim: mm} measured")
    ap.add_argument("--tol", type=float, default=0.05)
    a = ap.parse_args(argv)
    if a.ring_size is not None or a.diameter is not None:
        r = checks.ring_sizes(a.ring_size, a.diameter)
    else:
        r = checks.measure_check(json.loads(a.spec), json.loads(a.actual), a.tol)
    _print(r)
    return r


def t_weight(argv):
    ap = argparse.ArgumentParser(prog="weight_estimator")
    ap.add_argument("--mesh")
    ap.add_argument("--volume", type=float, help="mm3")
    ap.add_argument("--unit", default="auto")
    ap.add_argument("--band", nargs=3, type=float, metavar=("US_SIZE", "WIDTH", "THICK"))
    ap.add_argument("--stone", nargs=2, metavar=("CUT", "CARAT"), help="add stone dims")
    a = ap.parse_args(argv)
    vol = a.volume
    if a.mesh:
        v, t = read_mesh(a.mesh)
        unit = mesh_analyzer.guess_unit(v) if a.unit == "auto" else a.unit
        s = mesh_analyzer.UNITS[unit]
        from .mesh import signed_volume
        vol = abs(signed_volume(v, t)) * s ** 3
    if a.band:
        vol = core.band_volume(core.us_to_diameter(a.band[0]), a.band[1], a.band[2])
    out = {}
    if vol:
        out = {"volume_mm3": round(vol, 2), "grams": {k: round(core.grams(vol, k), 3) for k in core.METALS}, "wax_g": round(vol / 1000 * 1.0, 3)}
    if a.stone:
        L, W, D = core.stone_dims(a.stone[0], float(a.stone[1]))
        out["stone_mm"] = [round(L, 2), round(W, 2), round(D, 2)]
    _print(out)
    return out


def t_rebuild(argv):
    ap = argparse.ArgumentParser(prog="cad_rebuild_assistant")
    ap.add_argument("mesh")
    ap.add_argument("--unit", default="auto")
    ap.add_argument("-o", "--out")
    a = ap.parse_args(argv)
    v, t = read_mesh(a.mesh)
    unit = mesh_analyzer.guess_unit(v) if a.unit == "auto" else a.unit
    md = generators.rebuild_plan(mesh_analyzer.analyze(v, t, unit))
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(md)
    print(md)
    return md


def _builder_text():
    with open(os.path.join(RHINO_DIR, "pjc_rhino_builder.py"), encoding="utf-8") as fh:
        return fh.read()


def t_rhino(argv):
    ap = argparse.ArgumentParser(prog="rhino_macro_generator", description="Design JSON → runnable Rhino Python script")
    ap.add_argument("design")
    ap.add_argument("-o", "--out", default="paloan_design.py")
    a = ap.parse_args(argv)
    with open(a.design, encoding="utf-8") as fh:
        d = json.load(fh)
    params = dict(d.get("params", {}), type=d.get("type", "ring")) if "params" in d else d
    head = "import json as _json\nPARAMS = _json.loads(r'''%s''')\n\n" % json.dumps(params, indent=1)
    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write(head + _builder_text())
    print("wrote %s — in Rhino run: _-RunPythonScript \"%s\"" % (a.out, os.path.abspath(a.out)))
    return a.out


def t_gh(argv):
    ap = argparse.ArgumentParser(prog="grasshopper_builder", description="Write a GhPython component script (input P = design JSON, outputs a, b)")
    ap.add_argument("-o", "--out", default="paloan_ghpython.py")
    a = ap.parse_args(argv)
    note = ('"""GhPython component: add input P (str, item access) and outputs a (breps) and b (report).\n'
            'Wire a Panel with design JSON (copy from the web app: Rhino / GH → Copy params JSON) or build the\n'
            'JSON from sliders with a small Python/Format component for a live parametric system."""\n')
    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write(note + _builder_text())
    print("wrote", a.out)
    return a.out


def t_nurbs(argv):
    ap = argparse.ArgumentParser(prog="nurbs_cleaner", description="Copies the Rhino NURBS cleaner script next to you (run it inside Rhino).")
    ap.add_argument("-o", "--out", default="pjc_nurbs_cleaner.py")
    a = ap.parse_args(argv)
    with open(os.path.join(RHINO_DIR, "pjc_nurbs_cleaner.py"), encoding="utf-8") as src, open(a.out, "w", encoding="utf-8") as dst:
        dst.write(src.read())
    print("wrote %s — run inside Rhino (RunPythonScript) to audit and repair polysurfaces" % a.out)
    return a.out


TOOLS = {
    "mesh_analyzer": lambda argv: mesh_analyzer.main(argv),
    "cad_rebuild_assistant": t_rebuild,
    "manufacturing_checker": t_manufacturing,
    "stone_seat_generator": t_seat,
    "prong_optimizer": t_prong,
    "wall_thickness_validator": t_thickness,
    "joint_validator": t_joint,
    "spike_stability_checker": t_spike,
    "coil_generator": t_coil,
    "openwork_builder": t_openwork,
    "carving_surface_builder": t_carving,
    "backside_optimizer": t_backside,
    "measurement_validator": t_measure,
    "weight_estimator": t_weight,
    "nurbs_cleaner": t_nurbs,
    "grasshopper_builder": t_gh,
    "rhino_macro_generator": t_rhino,
}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # Windows consoles default to cp1252 (Ø, —, ≥ in reports)
    except (AttributeError, ValueError):
        pass
    if not argv or argv[0] in ("-h", "--help") or argv[0] not in TOOLS:
        print(__doc__)
        return 0 if argv and argv[0] in ("-h", "--help") else 1
    TOOLS[argv[0]](argv[1:])
    return 0


if __name__ == "__main__":
    sys.exit(main())
