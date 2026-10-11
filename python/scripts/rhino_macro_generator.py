"""rhino_macro_generator — thin wrapper: python scripts/rhino_macro_generator.py -h"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from paloan_cad.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["rhino_macro_generator"] + sys.argv[1:]))
