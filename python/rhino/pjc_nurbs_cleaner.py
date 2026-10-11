# -*- coding: utf-8 -*-
"""
Paloan NURBS cleaner - run inside Rhino 7/8 (RunPythonScript / ScriptEditor).

Audits every polysurface/surface in the document (or the current selection) for production problems
and fixes what can be fixed safely:
  * naked edges / open polysurfaces  -> JoinEdges within tolerance, then CapPlanarHoles
  * invalid breps                    -> Brep.Repair
  * non-manifold edges               -> reported (manual fix)
  * tiny / sliver faces              -> reported
  * mesh objects                     -> reported (convert with Mesh Lab plan)
Writes a report to the command line and puts problem objects on PJC::Problems.
"""
import Rhino
import Rhino.Geometry as rg
import scriptcontext as sc
import System.Drawing as SD

TOL = sc.doc.ModelAbsoluteTolerance


def problem_layer():
    idx = sc.doc.Layers.FindByFullPath("PJC::Problems", -1)
    if idx >= 0:
        return idx
    parent = sc.doc.Layers.FindByFullPath("PJC", -1)
    if parent < 0:
        lay = Rhino.DocObjects.Layer()
        lay.Name = "PJC"
        parent = sc.doc.Layers.Add(lay)
    lay = Rhino.DocObjects.Layer()
    lay.Name = "Problems"
    lay.ParentLayerId = sc.doc.Layers[parent].Id
    lay.Color = SD.Color.FromArgb(230, 60, 60)
    return sc.doc.Layers.Add(lay)


def audit(obj):
    geo = obj.Geometry
    issues = []
    if isinstance(geo, rg.Mesh):
        return ["mesh object (not NURBS) - rebuild via QuadRemesh/SubD or manual surfaces"], None
    brep = None
    if isinstance(geo, rg.Extrusion):
        brep = geo.ToBrep()
    elif isinstance(geo, rg.Brep):
        brep = geo.DuplicateBrep()
    if brep is None:
        return [], None
    fixed = False
    if not brep.IsValid:
        issues.append("invalid brep")
        if brep.Repair(TOL):
            fixed = True
            issues.append("  -> repaired")
    naked = [e for e in brep.Edges if e.Valence == rg.EdgeAdjacency.Naked]
    nonman = [e for e in brep.Edges if e.Valence == rg.EdgeAdjacency.NonManifold]
    if naked:
        issues.append("%d naked edges" % len(naked))
        brep.JoinNakedEdges(TOL * 10)
        capped = brep.CapPlanarHoles(TOL)
        if capped is not None:
            brep = capped
        still = len([e for e in brep.Edges if e.Valence == rg.EdgeAdjacency.Naked])
        if still < len(naked):
            fixed = True
            issues.append("  -> %d naked edges remain after JoinNakedEdges/CapPlanarHoles" % still)
    if nonman:
        issues.append("%d non-manifold edges (fix manually: ExtractSrf + rebuild)" % len(nonman))
    small = 0
    for f in brep.Faces:
        amp = rg.AreaMassProperties.Compute(f)
        if amp and amp.Area < TOL * TOL * 100:
            small += 1
    if small:
        issues.append("%d sliver faces" % small)
    if brep.IsSolid:
        vmp = rg.VolumeMassProperties.Compute(brep)
        if vmp and vmp.Volume < 0:
            brep.Flip()
            fixed = True
            issues.append("inside-out solid flipped")
    return issues, brep if fixed else None


def main():
    objs = list(sc.doc.Objects.GetSelectedObjects(False, False)) or [o for o in sc.doc.Objects if o.IsNormal]
    lay = None
    total = 0
    for o in objs:
        issues, fixed = audit(o)
        if not issues:
            continue
        total += 1
        name = o.Attributes.Name or str(o.Id)[:8]
        print("%s: %s" % (name, "; ".join(issues)))
        if fixed is not None:
            sc.doc.Objects.Replace(o.Id, fixed)
        if any("naked" in i or "non-manifold" in i or "mesh" in i for i in issues):
            lay = lay if lay is not None else problem_layer()
            attr = o.Attributes.Duplicate()
            attr.LayerIndex = lay
            sc.doc.Objects.ModifyAttributes(o.Id, attr, True)
    print("Paloan NURBS cleaner: %d objects checked, %d with issues" % (len(objs), total))
    sc.doc.Views.Redraw()


main()
