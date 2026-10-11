"""Minimal RhinoCommon stand-in so pjc_rhino_builder.py can be smoke-tested in plain CPython.
It checks control flow, maths and argument plumbing - not real NURBS results."""
import math
import sys
import types
from unittest.mock import MagicMock


class Vector3d:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        if isinstance(x, Vector3d):
            x, y, z = x.X, x.Y, x.Z
        self.X, self.Y, self.Z = float(x), float(y), float(z)

    def __add__(self, o):
        cls = Point3d if isinstance(o, Point3d) or isinstance(self, Point3d) else Vector3d
        return cls(self.X + o.X, self.Y + o.Y, self.Z + o.Z)

    def __sub__(self, o):
        if isinstance(self, Point3d) and not isinstance(o, Point3d):
            return Point3d(self.X - o.X, self.Y - o.Y, self.Z - o.Z)
        return Vector3d(self.X - o.X, self.Y - o.Y, self.Z - o.Z)

    def __mul__(self, o):
        if isinstance(o, Vector3d):
            return self.X * o.X + self.Y * o.Y + self.Z * o.Z
        return type(self)(self.X * o, self.Y * o, self.Z * o)

    __rmul__ = __mul__

    def __neg__(self):
        return type(self)(-self.X, -self.Y, -self.Z)

    @property
    def Length(self):
        return math.sqrt(self.X ** 2 + self.Y ** 2 + self.Z ** 2)

    def Unitize(self):
        L = self.Length or 1.0
        self.X, self.Y, self.Z = self.X / L, self.Y / L, self.Z / L
        return True

    @staticmethod
    def CrossProduct(a, b):
        return Vector3d(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X)


class Point3d(Vector3d):
    pass


Vector3d.XAxis, Vector3d.YAxis, Vector3d.ZAxis = Vector3d(1, 0, 0), Vector3d(0, 1, 0), Vector3d(0, 0, 1)
Point3d.Origin = Point3d(0, 0, 0)
Point3d.Unset = Point3d(-1.23e308, -1.23e308, -1.23e308)


def _brep(*_a, **_k):
    b = MagicMock(name="Brep")
    b.IsSolid = True
    b.CapPlanarHoles.return_value = b
    b.DuplicateBrep.return_value = b
    return b


def _check_pts(pts, n=2):
    pts = list(pts)
    assert len(pts) >= n, "too few points"
    for p in pts:
        assert all(math.isfinite(v) for v in (p.X, p.Y, p.Z)), "non-finite point"
    return pts


def _positive(r):
    assert r > 0, "radius must be positive"
    return r


def install():
    calls = {"pipe": 0, "loft": 0, "bool": 0, "rev": 0, "interp": 0}
    rg = types.ModuleType("Rhino.Geometry")
    rg.Point3d, rg.Vector3d = Point3d, Vector3d

    class Curve:
        @staticmethod
        def CreateInterpolatedCurve(pts, degree, style=None):
            calls["interp"] += 1
            _check_pts(pts, 2)
            c = MagicMock(name="Curve")
            c.Domain.T0, c.Domain.T1 = 0.0, 1.0
            return c

    class BrepNS:
        @staticmethod
        def CreatePipe(*a):
            calls["pipe"] += 1
            assert len(a) in (7, 8), "CreatePipe overload arity"
            if len(a) == 7:
                _positive(a[1])
            else:
                [_positive(r) for r in a[2]]
            return [_brep()]

        @staticmethod
        def CreateFromLoft(curves, start, end, lt, closed):
            calls["loft"] += 1
            assert len(list(curves)) >= 1
            return [_brep()]

        @staticmethod
        def CreateBooleanDifference(a, b, tol):
            calls["bool"] += 1
            return [_brep()]

        @staticmethod
        def CreateBooleanUnion(a, tol):
            calls["bool"] += 1
            return [_brep()]

        @staticmethod
        def CreateFromRevSurface(rev, a, b):
            calls["rev"] += 1
            return _brep()

    rg.Curve = Curve
    rg.Brep = BrepNS
    rg.CurveKnotStyle = MagicMock()
    rg.LoftType = MagicMock()
    rg.PipeCapMode = types.SimpleNamespace(Round="Round", Flat="Flat", **{"None": "None"})
    rg.PolylineCurve = lambda pts: (_check_pts(pts, 3), MagicMock(name="Polyline"))[1]
    rg.RevSurface = types.SimpleNamespace(Create=lambda c, l: MagicMock(name="Rev"))
    rg.Line = lambda a, b: (a, b)
    rg.Sphere = lambda c, r: (_positive(r), MagicMock(ToBrep=_brep))[1]
    rg.Surface = types.SimpleNamespace(CreateExtrusion=lambda c, v: MagicMock(ToBrep=_brep))
    rg.Plane = lambda *a: MagicMock(PointAt=lambda x, y: Point3d(x, y, 0))
    rg.Torus = lambda *a: MagicMock()
    rg.Cylinder = lambda *a: MagicMock(ToBrep=lambda *x: _brep())
    rg.Circle = lambda *a: MagicMock()
    rg.Transform = MagicMock()
    rg.VolumeMassProperties = types.SimpleNamespace(Compute=lambda b: types.SimpleNamespace(Volume=10.0))

    rhino = types.ModuleType("Rhino")
    rhino.Geometry = rg
    rhino.DocObjects = MagicMock()
    sc = types.ModuleType("scriptcontext")
    sc.doc = MagicMock()
    sc.doc.ModelAbsoluteTolerance = 0.001
    sc.doc.Layers.FindByFullPath.return_value = -1
    sc.doc.Layers.Add.return_value = 0
    system = types.ModuleType("System")
    system.Guid = types.SimpleNamespace(Empty="0")
    system.Drawing = MagicMock()
    for name, mod in {"Rhino": rhino, "Rhino.Geometry": rg, "scriptcontext": sc, "System": system,
                      "System.Drawing": system.Drawing, "rhinoscriptsyntax": MagicMock()}.items():
        sys.modules[name] = mod
    return calls
