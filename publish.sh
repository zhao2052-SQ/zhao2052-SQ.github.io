#!/usr/bin/env bash
# Publish local edits to https://zhao2052-sq.github.io
#   ./publish.sh
#   ./publish.sh "Add new paper"
set -euo pipefail
cd "$(dirname "$0")"

if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to publish - no changes since the last push."
  exit 0
fi

git add -A
git -c user.name="Siqi (Stella) Zhao" \
    -c user.email="zhao2052@umn.edu" \
    commit -q -m "${1:-Update site content}"
git push origin main

echo
echo "Pushed. GitHub Actions is rebuilding the site now."
echo "Live in about a minute: https://zhao2052-sq.github.io"
echo "Build status: https://github.com/zhao2052-SQ/zhao2052-SQ.github.io/actions"
