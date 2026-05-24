from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
PNPM_VERSION = "10.28.2"
logger = logging.getLogger("local-review-gate")


def _run(name: str, command: list[str], *, env: dict[str, str] | None = None) -> None:
    logger.info("\n==> %s", name)
    logger.info("%s", " ".join(command))
    result = subprocess.run(command, cwd=ROOT_DIR, env=env, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def _bash_is_usable() -> bool:
    if not shutil.which("bash"):
        return False
    result = subprocess.run(
        ["bash", "--version"],
        cwd=ROOT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def _test_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("TESTING", "true")
    if env.get("OPENAI_API_KEY") and not env.get("ZHIPU_API_KEY"):
        env["ZHIPU_API_KEY"] = env["OPENAI_API_KEY"]
    return env


def _ensure_test_dirs() -> None:
    for relative in ("data/plugins", "data/config", "data/temp"):
        (ROOT_DIR / relative).mkdir(parents=True, exist_ok=True)


def _run_pytest_gate(env: dict[str, str]) -> None:
    if _bash_is_usable():
        _run(
            "Unit tests through CI script",
            ["bash", "./scripts/run_pytests_ci.sh", "./tests"],
            env=env,
        )
        return

    _ensure_test_dirs()
    _run(
        "Unit tests through local pytest equivalent",
        ["uv", "run", "pytest", "./tests", "-q", "--tb=short", "-x"],
        env=env,
    )


def _run_dashboard_gate() -> None:
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise SystemExit("npx is required for dashboard review gates.")
    pnpm = [npx, f"pnpm@{PNPM_VERSION}", "-C", "dashboard"]
    _run("Dashboard install", [*pnpm, "install", "--frozen-lockfile"])
    _run("Dashboard lint", [*pnpm, "run", "lint:check"])
    _run("Dashboard build", [*pnpm, "run", "build"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local review gates that mirror the main repository checks.",
    )
    parser.add_argument(
        "--skip-sync",
        action="store_true",
        help="Skip uv dependency sync before Python checks.",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Skip the full pytest suite.",
    )
    parser.add_argument(
        "--skip-smoke",
        action="store_true",
        help="Skip the startup smoke test.",
    )
    parser.add_argument(
        "--skip-dashboard",
        action="store_true",
        help="Skip dashboard install, lint, and build.",
    )
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parse_args()
    env = _test_env()

    _run("Git whitespace check", ["git", "diff", "--check"])

    if not args.skip_sync:
        _run("Sync Python dev dependencies", ["uv", "sync", "--group", "dev"], env=env)

    _run("Ruff format check", ["uv", "run", "ruff", "format", "--check", "."])
    _run("Ruff lint check", ["uv", "run", "ruff", "check", "."])
    _run(
        "Local review script format check",
        ["uv", "run", "ruff", "format", "--check", "scripts/local_review_gate.py"],
    )
    _run(
        "Local review script lint check",
        ["uv", "run", "ruff", "check", "scripts/local_review_gate.py"],
    )
    _run(
        "Code quality typing score",
        ["uv", "run", "pytest", "tests/test_code_quality_typing.py", "-v"],
        env=env,
    )

    if not args.skip_tests:
        _run_pytest_gate(env)

    if not args.skip_smoke:
        _run(
            "Startup smoke test",
            ["uv", "run", "python", "scripts/smoke_startup_check.py"],
            env=env,
        )

    if not args.skip_dashboard:
        _run_dashboard_gate()

    logger.info("\nAll local review gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
