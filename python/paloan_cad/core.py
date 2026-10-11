"""Shared reference data and maths for the Paloan Jewelry CAD toolkit (pure Python, no dependencies).
Units: millimetres, grams, g/cm3 (= mg/mm3)."""
import math

METALS = {
    "24k": ("24K Gold (999)", 19.32), "22k": ("22K Yellow Gold", 17.80), "18ky": ("18K Yellow Gold", 15.50),
    "18kw": ("18K White Gold", 15.90), "18kr": ("18K Rose Gold", 15.20), "14ky": ("14K Yellow Gold", 13.10),
    "14kw": ("14K White Gold", 12.60), "14kr": ("14K Rose Gold", 13.00), "10ky": ("10K Yellow Gold", 11.60),
    "pt950": ("Platinum 950", 20.10), "pd950": ("Palladium 950", 12.00), "ag925": ("Sterling Silver 925", 10.36),
    "brass": ("Brass", 8.50),
}
GEMS = {"diamond": 3.52, "labdiamond": 3.52, "moissanite": 3.21, "sapphire": 4.00, "ruby": 4.00, "emerald": 2.72,
        "amethyst": 2.65, "tourmaline": 3.06, "onyx": 2.65, "cz": 5.80}
# cut: (length/width ratio, width of a 1 ct diamond in mm, total depth as fraction of width, table fraction)
CUTS = {
    "round": (1.00, 6.40, 0.615, 0.57), "oval": (1.40, 5.60, 0.60, 0.57), "cushion": (1.05, 5.60, 0.66, 0.60),
    "princess": (1.00, 5.50, 0.72, 0.68), "emerald": (1.40, 5.00, 0.65, 0.65), "asscher": (1.00, 5.50, 0.66, 0.62),
    "radiant": (1.25, 5.50, 0.66, 0.64), "pear": (1.55, 5.50, 0.60, 0.56), "marquise": (2.00, 5.00, 0.60, 0.56),
    "heart": (1.00, 6.20, 0.60, 0.56), "trillion": (1.00, 6.80, 0.45, 0.60),
}
CORNER_CUTS = {"princess", "asscher", "emerald", "radiant", "cushion"}
POINTED_CUTS = {"pear": 1, "marquise": 2, "heart": 1, "trillion": 3}

RULES = {
    "ring_shank_fail": 1.0, "ring_shank_warn": 1.3, "ring_width_min": 1.5,
    "seat_overlap_min": 0.08, "seat_overlap_max": 0.35,
    "spike_base_min": 1.0, "spike_ratio_warn": 2.5, "spike_ratio_fail": 3.6,
    "bridge_warn": 0.8, "bridge_fail": 0.6, "hole_min": 0.6,
    "hollow_wall_min": 0.6, "hollow_rail_min": 0.8,
    "halo_gap_min": 0.08, "halo_gap_max": 0.3, "bead_min": 0.5,
    "bezel_wall_min": 0.5, "chain_wire_min": 0.6,
    "hinge_clear_min": 0.05, "hinge_clear_max": 0.2,
    "post_dia_min": 0.76, "post_dia_max": 0.95, "bail_inner_min": 3.0,
    "head_height_warn": 8.5, "weight_tolerance": 0.05,
}
SOFT_METALS = {"ag925", "24k", "22k"}


def density(metal):
    if metal not in METALS:
        raise KeyError("unknown metal %r (choose from %s)" % (metal, ", ".join(METALS)))
    return METALS[metal][1]


def grams(volume_mm3, metal):
    return volume_mm3 * density(metal) / 1000.0


def prong_dia_for(stone_min_width):
    w = stone_min_width
    return 0.6 if w <= 3 else 0.75 if w <= 5 else 0.9 if w <= 7 else 1.05 if w <= 9 else 1.2


# ---- ring sizes ----
def us_to_diameter(us):
    return 11.63 + 0.8128 * us


def diameter_to_us(d):
    return (d - 11.63) / 0.8128


def us_to_eu(us):
    return math.pi * us_to_diameter(us)


def us_to_uk(us):
    idx = max(0.0, min(25.5, (us - 0.5) * 2))
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[int(idx)] + ("½" if idx - int(idx) >= 0.5 else "")


def us_to_india(us):
    return int(round(math.pi * us_to_diameter(us) - 40))


# ---- stones ----
def stone_dims(cut, carat, gem="diamond"):
    """(length, width, depth) in mm for a calibrated stone of the given carat weight."""
    ratio, w1, depth, _ = CUTS.get(cut, CUTS["round"])
    k = (max(carat, 0.005) * GEMS["diamond"] / GEMS.get(gem, 3.52)) ** (1.0 / 3.0)
    w = w1 * k
    return w * ratio, w, w * depth


def carat_from_dims(cut, length, width, gem="diamond"):
    ratio, w1, _, _ = CUTS.get(cut, CUTS["round"])
    w_eq = math.sqrt(length * width / ratio)
    return (w_eq / w1) ** 3 * GEMS.get(gem, 3.52) / GEMS["diamond"]


# ---- simple solids ----
def torus_volume(major_r, minor_r):
    return 2 * math.pi ** 2 * major_r * minor_r ** 2


def band_volume(inner_d, width, thickness, fill=0.88):
    """Approximate volume of a ring band; fill = profile area / (w*t) (comfort ~0.85-0.9, flat ~0.97, round 0.785)."""
    r_mid = inner_d / 2 + thickness / 2
    return 2 * math.pi * r_mid * width * thickness * fill


def fmt(x, d=2):
    return ("%%.%df" % d) % x
