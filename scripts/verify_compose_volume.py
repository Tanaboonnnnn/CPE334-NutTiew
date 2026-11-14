#!/usr/bin/env python3
"""Validate fresh-clone Compose volume isolation without starting Docker.

The Compose project owns its PostgreSQL data volume by default; an explicit
NUTTIEW_DB_VOLUME override is accepted only when an operator intentionally
chooses to reuse a named volume. This test never creates volumes or containers.
"""

import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent


def resolved_volume(project: str, empty_env: Path, override: str | None = None) -> str:
    env = os.environ.copy()
    env.pop("NUTTIEW_DB_VOLUME", None)
    env.pop("COMPOSE_PROJECT_NAME", None)
    env.update({
        "POSTGRES_PASSWORD": secrets.token_hex(32),
        "DB_OWNER_PASSWORD": secrets.token_hex(32),
        "DB_RUNTIME_PASSWORD": secrets.token_hex(32),
        "AUTH_CSRF_HMAC_KEY": secrets.token_hex(32),
        "AUTH_RATE_KEY": secrets.token_hex(32),
        "NUTTIEW_HTTP_PORT": "3199",
    })
    if override is not None:
        env["NUTTIEW_DB_VOLUME"] = override

    result = subprocess.run(
        [
            "docker", "compose", "-p", project, "-f", str(ROOT / "docker-compose.yml"),
            "--env-file", str(empty_env), "config", "--format", "json",
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"docker compose config failed for project {project} "
            f"(exit {result.returncode}); Docker Compose CLI is required"
        )
    payload = json.loads(result.stdout)
    return payload["volumes"]["nuttiew_pg_data"].get("name", "")


def main() -> int:
    try:
        with tempfile.TemporaryDirectory(prefix="nuttiew-compose-config-") as tmp:
            empty_env = Path(tmp) / "empty.env"
            empty_env.write_text("", encoding="utf-8")

            one = resolved_volume("c03probealpha", empty_env)
            two = resolved_volume("c03probebeta", empty_env)
            expected_one = "c03probealpha_nuttiew_pg_data"
            expected_two = "c03probebeta_nuttiew_pg_data"
            if (one, two) != (expected_one, expected_two):
                raise AssertionError(
                    "default volume names must be nonempty and project-scoped: "
                    f"expected {expected_one!r}, {expected_two!r}; "
                    f"got {one!r}, {two!r}"
                )

            explicit = "c03_explicit_reuse_only"
            override = resolved_volume("c03probealpha", empty_env, explicit)
            if override != explicit:
                raise AssertionError(
                    f"explicit NUTTIEW_DB_VOLUME must be respected: got {override!r}"
                )

        print("PASS: two independent Compose projects have isolated default DB volume names")
        print("PASS: explicit NUTTIEW_DB_VOLUME override is honored")
        print("PASS: no Docker engine, database, or cloud resources contacted")
        return 0
    except (RuntimeError, AssertionError, KeyError, json.JSONDecodeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
