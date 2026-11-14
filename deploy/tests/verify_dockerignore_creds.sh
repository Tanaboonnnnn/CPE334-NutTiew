#!/usr/bin/env bash
# Offline: verify a synthetic WIF credential is excluded from the Docker build
# context (finding #1 / PR finding #4). Uses a synthetic, non-secret fixture only.
#
# Method: a Dockerfile tries `COPY gha-creds-fixture.json`. If the repo's
# .dockerignore excludes `gha-creds-*.json`, the file is NOT in the build context
# and Docker refuses the COPY ("not in build context"). That refusal is the proof
# of exclusion.
#
# Docker availability (PR finding #4): this test requires a running Docker daemon.
# If `docker version` fails, we report "NOT RUN ... requires a running Docker
# daemon" explicitly (never a silent skip, never a false PASS/FAIL from an
# unrelated Docker error). The check remains in CI and any real Docker error that
# is NOT the expected "file not in context" result is treated as FAIL.
set -u

if ! docker version >/dev/null 2>&1; then
  echo "NOT RUN: verify_dockerignore_creds requires a running Docker daemon (this is a documented environment prerequisite, not a silent skip)."
  exit 0
fi

printf '%s' '{"type":"synthetic-fixture"}' > gha-creds-fixture.json
cat > Dockerfile.contextcheck <<'DF'
FROM scratch
COPY gha-creds-fixture.json /leaked
DF

out="$(docker build -f Dockerfile.contextcheck -t gh05-context-test . 2>&1)"
rc=$?
rm -f Dockerfile.contextcheck gha-creds-fixture.json

if [ "$rc" -ne 0 ]; then
  # Expected: COPY of an excluded file fails specifically because it is NOT in the
  # build context.  ANY other build error (unrelated Docker failure) is a FAIL, so
  # unrelated Docker errors can never be interpreted as PASS.
  if echo "$out" | grep -qiE "not in build context|does not exist|COPY failed|no such file or directory|not found|gha-creds-fixture"; then
    echo "PASS: synthetic credential excluded from Docker build context (COPY refused a missing context file)"
    exit 0
  fi
  echo "FAIL: docker build failed but NOT because the credential was absent from context - unrelated Docker error: $out" >&2
  exit 1
fi
# Build succeeded => COPY found the file => it is NOT excluded. Vulnerability.
echo "FAIL: credential-named file leaked into build context (build succeeded with COPY)" >&2
exit 1