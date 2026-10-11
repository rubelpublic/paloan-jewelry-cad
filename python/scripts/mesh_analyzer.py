"""mesh_analyzer — thin wrapper: python scripts/mesh_analyzer.py -h"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from paloan_cad.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["mesh_analyzer"] + sys.argv[1:]))
