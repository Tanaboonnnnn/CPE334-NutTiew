#!/usr/bin/env bash
# Offline: verify `gha-creds-*.json` is ignored by .gitignore (finding #1).
# Uses a synthetic credential-NaMe only; never a real credential.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
cd "$REPO"

# git check-ignore --no-index compares a path against ignore rules without needing
# a file on disk.  It must recognize a synthetic credential filename.
if git check-ignore --no-index -q gha-creds-synthetic.json; then
  echo "PASS: .gitignore excludes gha-creds-*.json (git check-ignore exit 0)"
  exit 0
else
  echo "FAIL: .gitignore does NOT exclude gha-creds-*.json" >&2
  exit 1
fi