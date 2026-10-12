"""Smoke-test the Rhino builder for every jewelry type against the RhinoCommon mock."""
import os
import runpy
import sys

sys.path.insert(0, os.path.dirname(__file__))
import rhino_mock  # noqa: E402

BUILDER = os.path.join(os.path.dirname(__file__), "..", "rhino", "pjc_rhino_builder.py")

CASES = [
    {"type": "ring", "metal": "18ky", "cut": "round", "carat": 1.0, "headType": "prong", "prongCount": 4},
    {"type": "ring", "cut": "oval", "carat": 1.5, "headType": "halo", "cathedral": True, "milgrain": True, "prongCount": 6},
    {"type": "ring", "cut": "marquise", "headType": "prong", "prongStyle": "pointed", "prongCount": 6, "spikes": 14,
     "openwork": "arch", "widthTop": 6.5, "widthBottom": 5.5, "profile": "knife"},
    {"type": "ring", "shankStyle": "split", "cut": "pear", "headType": "bezel", "coils": 4},
    {"type": "ring", "shankStyle": "twisted", "headType": "none"},
    {"type": "ring", "headType": "prong", "cut": "emerald", "backHollow": True, "hollowDepth": 0.5, "openwork": "quatrefoil",
     "spikeRows": 2, "spikes": 10},
    {"type": "ring", "headType": "prong", "cut": "heart"},
    {"type": "ring", "headType": "prong", "cut": "trillion", "prongCount": 3},
    {"type": "ring", "headType": "prong", "cut": "princess"},
    {"type": "ring", "headType": "prong", "cut": "cushion", "sizeMode": "mm", "stoneL": 7, "stoneW": 6.5},
    {"type": "pendant", "shape": "gothic-cross", "headType": "bezel", "cut": "pear", "spikes": 16, "openwork": "circle",
     "height": 34, "width": 24},
    {"type": "pendant", "shape": "heart", "headType": "halo", "cut": "heart", "backHollow": True},
    {"type": "pendant", "shape": "teardrop", "headType": "none"},
    {"type": "pendant", "shape": "custom", "customOutline": [[0, 10], [8, 0], [0, -10], [-8, 0]], "headType": "none"},
    {"type": "earring", "earType": "stud", "cut": "round", "carat": 0.5},
    {"type": "earring", "earType": "hoop"},
    {"type": "earring", "earType": "drop", "dropShape": "teardrop", "headType": "bezel"},
    {"type": "bangle", "hinge": True},
    {"type": "bangle", "cuffGap": 25},
    {"type": "chain", "linkType": "cable"},
    {"type": "chain", "linkType": "rolo"},
    {"type": "ring", "shankStyle": "signet", "signetShape": "octagon", "signetFace": "initials-engrave", "signetText": "AR",
     "extra": {"meshes": [{"layer": "Cutters::Engraving", "name": "cut", "kind": "cutter", "v": [0, 0, 0, 1, 0, 0, 0, 1, 0], "f": [0, 1, 2]}]}},
    {"type": "ring", "cut": "oval", "carat": 1.5, "sideStones": "three-stone", "sideCut": "pear", "accentMode": "half-eternity", "headMetal": "18ky"},
    {"type": "ring", "headType": "none", "accentMode": "full-eternity", "accentSize": 2.0},
    {"type": "ring", "cut": "round", "accentCount": 5},
    {"type": "relief", "width": 22, "extra": {"reliefTop": 11, "meshes": [{"layer": "Metal::Body::Relief", "name": "Relief", "v": [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], "f": [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]}]}},
    {"type": "ring", "headType": "collet", "cut": "round", "carat": 0.8, "colletTaper": 1.0},
    {"type": "ring", "headType": "flush", "cut": "round", "sizeMode": "mm", "stoneL": 3, "stoneW": 3},
    {"type": "ring", "headType": "double-prong", "cut": "cushion", "carat": 1.2},
    {"type": "ring", "headType": "half-bezel", "cut": "oval", "carat": 1},
    {"type": "ring", "headType": "prong", "petals": 8, "petalLayers": 2, "petalTip": "round", "prongRotate": 20, "prongHeight": 1.2, "prongTip": 1.3},
    {"type": "pendant", "headType": "collet", "petals": 6, "cut": "round"},
    {"type": "ring", "headType": "none", "widthTop": 6, "gems": [
        {"cut": "round", "L": 1.5, "W": 1.5, "gem": "diamond", "p": [0, 10.3, 1.2], "n": [0, 1, 0], "depth": 0.05,
         "prongs": {"count": 4, "dia": 0.45, "height": 0.3, "tip": "bead"}, "cutter": {"on": True, "tol": 0.04, "top": 1.2, "hole": True, "holeRatio": 0.55, "holeDepth": 1.6}},
        {"cut": "pear", "L": 3, "W": 2, "gem": "ruby", "p": [2, 10.1, 0], "n": [0.2, 0.98, 0], "rot": 30, "prongs": {"count": 2}, "cutter": {"on": True, "hole": False}}]},
    {"type": "name", "text": "Amelia", "extra": {"outlines": [{"outer": [[0, 0], [5, 0], [5, 5], [0, 5]], "holes": [[[1, 1], [2, 1], [2, 2]]], "z0": -0.6, "z1": 0.6}]}},
]


def run_case(params):
    calls = rhino_mock.install()
    ns = runpy.run_path(BUILDER, init_globals={"PARAMS": dict(params)})
    return calls, ns["OUT"], ns["REPORT"]


def test_all_types_build():
    for case in CASES:
        _, out, report = run_case(case)
        metal = [o for o in out if o[3] == "metal"]
        assert metal, "no metal parts for %s" % case
        assert any("Metal volume" in r for r in report), report


def test_ring_layers():
    _, out, _ = run_case(CASES[1])
    layers = {o[1] for o in out}
    for need in ("Metal::Shank", "Stones::Center", "Stones::Halo", "Metal::Head::Prongs", "Metal::Shank::Cathedral"):
        assert need in layers, (need, layers)


if __name__ == "__main__":
    test_all_types_build()
    test_ring_layers()
    print("rhino builder smoke tests passed (%d cases)" % len(CASES))
