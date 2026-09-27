#!/usr/bin/env bash
# hub-workspace exemplar · stage the deploy artifact.
# _site/ = site/ + docs/ + the skill's own documents (SKILL.md, README.md, LICENSE, references/,
# reviews/, assets/) copied in from the repository root, so the Viewer can render them.
# Nothing else ever ships. Exclusions are a publication-safety control.
set -euo pipefail
HUB="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HUB/../.." && pwd)"
OUT="$HUB/_site"
rm -rf "$OUT"
mkdir -p "$OUT/docs" "$OUT/references" "$OUT/reviews" "$OUT/assets"
rsync -a --exclude '.DS_Store' "$HUB/site/"        "$OUT/"
rsync -a --exclude '.DS_Store' "$HUB/docs/"        "$OUT/docs/"
rsync -a --exclude '.DS_Store' "$REPO/references/" "$OUT/references/"
rsync -a --exclude '.DS_Store' "$REPO/reviews/"    "$OUT/reviews/"
cp "$REPO/SKILL.md" "$REPO/README.md" "$REPO/LICENSE" "$OUT/"
cp "$REPO/assets/banner.svg" "$OUT/assets/banner.svg"   # same path the README links, so the Viewer resolves it
if find "$OUT" \( -name '.dev.vars' -o -name '*.env' -o -name '.env*' \) | grep -q .; then
  echo "FAIL: secret-looking file inside _site/" >&2; exit 1
fi
echo "Staged $(find "$OUT" -type f | wc -l | tr -d ' ') files into _site/"
