"""Create curated demo replays in backend/replays/demo/ (committed, D-30). Simulated data.

python scripts/demo_replays.py                       # info_gain on the default cases
python scripts/demo_replays.py --planner meta        # needs the model in backend/.env
python scripts/demo_replays.py --cases case-t4 --seed 2
"""

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))  # run from any folder without relying on the install

from app.agent.investigate import investigate, investigation_id  # noqa: E402
from app.agent.llm_client import ChatCompletionsClient  # noqa: E402
from app.agent.meta_planner import MetaPlanner  # noqa: E402
from app.agent.planners import Planner, rule_planner  # noqa: E402
from app.api.storage import ReplayStore  # noqa: E402
from app.cases import get_scenario  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.runner import make_runner  # noqa: E402
from app.schemas.investigation import Trace  # noqa: E402

DEMO_DIR = BACKEND_DIR / "replays" / "demo"
DEFAULT_CASES = ("case-k7", "case-b6", "case-x1")


def planner_for(name: str) -> Planner:
    if name != "meta":
        return rule_planner(name)
    settings = get_settings()
    if not settings.llm_configured:
        sys.exit("Meta model not configured: fill FAILURELAB_LLM_* in backend/.env")
    return MetaPlanner(ChatCompletionsClient.from_settings(settings))


def make_demo(case_id: str, planner_name: str, seed: int, out: Path) -> Path:
    scenario = get_scenario(case_id)
    if scenario is None:
        sys.exit(f"unknown case {case_id!r}")
    now = datetime.now(UTC) if planner_name == "meta" else None
    trace = investigate(
        scenario.view(),
        make_runner(scenario, seed),
        planner_for(planner_name),
        seed,
        trace_id=investigation_id(case_id, planner_name, seed, now),
    )
    return ReplayStore(out).save(Trace.model_validate(trace).model_dump(mode="json"))


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
