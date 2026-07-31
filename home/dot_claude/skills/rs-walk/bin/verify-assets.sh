#!/usr/bin/env bash
# rs-walk verify-assets — fails if the committed assets/walk.css does not match
# what build-assets.sh produces from assets/style/.
#
# A generated artifact that silently drifts from its source is worse than no
# artifact: it looks reviewed and isn't. Run this in a pre-commit hook or CI.
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMITTED="${SKILL_ROOT}/assets/walk.css"

TMP=$(mktemp -t walk-css)
trap 'rm -f "${TMP}"' EXIT

bash "${SKILL_ROOT}/bin/build-assets.sh" "${TMP}" >/dev/null

if [ ! -f "${COMMITTED}" ]; then
  echo "ERROR: ${COMMITTED} does not exist. Run: bash bin/build-assets.sh" >&2
  exit 1
fi

if ! diff -q "${COMMITTED}" "${TMP}" >/dev/null; then
  echo "ERROR: assets/walk.css is stale — it does not match assets/style/." >&2
  echo "       Regenerate with: bash ${SKILL_ROOT}/bin/build-assets.sh" >&2
  diff "${COMMITTED}" "${TMP}" | head -20 >&2
  exit 1
fi

echo "OK  assets/walk.css matches assets/style/"
