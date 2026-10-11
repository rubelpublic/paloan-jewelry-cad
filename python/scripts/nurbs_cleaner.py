"""nurbs_cleaner — thin wrapper: python scripts/nurbs_cleaner.py -h"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from paloan_cad.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["nurbs_cleaner"] + sys.argv[1:]))
