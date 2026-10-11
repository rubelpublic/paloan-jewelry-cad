"""weight_estimator — thin wrapper: python scripts/weight_estimator.py -h"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from paloan_cad.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["weight_estimator"] + sys.argv[1:]))
