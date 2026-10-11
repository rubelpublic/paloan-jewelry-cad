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
