#!/usr/bin/env bash
# Remove worktrees and local branches already merged into origin/main.
# Skips the main checkout, worktrees with uncommitted/untracked (non-ignored) changes,
# and worktrees touched within the last hour (another session may be using them).
# Usage: npm run prune:worktrees [-- --dry-run]
set -euo pipefail
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
cd "$(git rev-parse --show-toplevel)"
main_wt=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
git fetch -q origin main
run() { if [ $dry = 1 ]; then echo "[dry] $*"; else "$@"; fi; }

git worktree list --porcelain | awk '/^worktree/{w=$2}/^branch/{sub("refs/heads/","",$2); print w"\t"$2}' |
while IFS=$'\t' read -r wt br; do
  [ "$wt" = "$main_wt" ] && continue
  git merge-base --is-ancestor "$br" origin/main || continue
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then echo "keep (dirty): $wt"; continue; fi
  if [ -n "$(find "$wt" -maxdepth 0 -mmin -60)" ]; then echo "keep (recent): $wt"; continue; fi
  run git worktree remove --force "$wt" && echo "removed: $wt"
done
git worktree prune

used=$(git worktree list --porcelain | awk '/^branch/{sub("refs/heads/","",$2); print $2}')
for br in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  [ "$br" = main ] && continue
  grep -qxF "$br" <<<"$used" && continue
  git merge-base --is-ancestor "$br" origin/main && run git branch -qD "$br" && echo "deleted branch: $br"
done
exit 0
