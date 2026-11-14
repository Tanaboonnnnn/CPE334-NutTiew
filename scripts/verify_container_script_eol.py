#!/usr/bin/env python3
"""Fail when a Windows fresh clone can break the Postgres init-script shebang."""

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = Path("compose/db-init.sh")


def main() -> int:
    attr = subprocess.run(
        ["git", "check-attr", "eol", "--", SCRIPT.as_posix()],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    expected = f"{SCRIPT.as_posix()}: eol: lf"
    if attr.returncode != 0 or attr.stdout.strip() != expected:
        print(
            "FAIL: compose/db-init.sh must have Git attribute eol=lf "
            "(to survive Windows core.autocrlf=true checkout)",
            file=sys.stderr,
        )
        return 1

    contents = (ROOT / SCRIPT).read_bytes()
    if b"\r\n" in contents or contents.startswith(b"#!/usr/bin/env bash\r"):
        print(
            "FAIL: compose/db-init.sh checkout contains CRLF; "
            "Linux docker-entrypoint cannot execute bash\\r",
            file=sys.stderr,
        )
        return 1

    print("PASS: compose/db-init.sh eol=lf and checked-out bytes contain no CRLF")
    return 0


if __name__ == "__main__":
    sys.exit(main())
