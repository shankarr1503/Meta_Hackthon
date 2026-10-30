"""Create curated demo replays in backend/replays/demo/ (committed, D-30). Simulated data.

python scripts/demo_replays.py                       # info_gain on the default cases
python scripts/demo_replays.py --planner meta        # needs the model in backend/.env
python scripts/demo_replays.py --cases case-t4 --seed 2
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))  # run from any folder without relying on the install

from app.api.runs import MetaNotConfiguredError, run_and_save  # noqa: E402
from app.api.storage import ReplayStore  # noqa: E402
from app.cases import get_scenario  # noqa: E402
from app.config import get_settings  # noqa: E402

DEMO_DIR = BACKEND_DIR / "replays" / "demo"
DEFAULT_CASES = ("case-k7", "case-b6", "case-x1")


def make_demo(case_id: str, planner_name: str, seed: int, out: Path) -> Path:
    scenario = get_scenario(case_id)
    if scenario is None:
        sys.exit(f"unknown case {case_id!r}")
    store = ReplayStore(out)
    try:
        trace = run_and_save(scenario, planner_name, seed, get_settings(), store)
    except MetaNotConfiguredError as error:
        sys.exit(str(error))
    return store.path_for(trace.investigation_id)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--planner", default="info_gain")
    parser.add_argument("--cases", nargs="+", default=list(DEFAULT_CASES))
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=DEMO_DIR)
    args = parser.parse_args(argv)
    for case_id in args.cases:
        print(f"saved {make_demo(case_id, args.planner, args.seed, args.out)}")


if __name__ == "__main__":
    main()
