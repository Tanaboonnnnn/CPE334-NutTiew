#!/usr/bin/env bash
# Contract: gcloud Artifact Registry describe exposes image_summary.digest.
# An unknown --format field returns an empty string with exit status 0,
# which must never pass the release image digest preflight.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${HERE}/../lib-nuttiew.sh"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
cat > "${TMP}/gcloud" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -eq 6 ] && [ "$1" = artifacts ] && [ "$2" = docker ] && [ "$3" = images ] && [ "$4" = describe ] && [ "$6" = '--format=value(image_summary.digest)' ]; then
  printf 'sha256:%064d\n' 0
fi
FAKE
chmod +x "${TMP}/gcloud"
EXPECTED="sha256:$(printf '%064d' 0)"
REF='asia-southeast1-docker.pkg.dev/example-project/nuttiew/nuttiew:0123456789abcdef0123456789abcdef01234567'
ACTUAL="$(PATH="${TMP}:${PATH}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 bash -c 'source "$1"; resolve_image_digest "$2"' _ "$LIB" "$REF")"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  printf 'FAIL: expected image digest from image_summary.digest (got %s)\n' "$ACTUAL" >&2
  exit 1
fi
printf 'PASS: Artifact Registry image digest lookup matches the real gcloud output field\n'
