#!/usr/bin/env bash
#
# Publish this folder to GitHub Pages via GitHub Actions.
#
# The workflow in .github/workflows/deploy.yml does the actual deploy on every
# push to main. This script bootstraps what the workflow cannot do itself:
# create the repo, point Pages at Actions, push, then follow the run.
#
# Safe to run repeatedly.
#
#   ./deploy.sh                     first run, or publish the latest changes
#   ./deploy.sh -m "Fix totals"     with a commit message
#   ./deploy.sh -n pub-quiz         use a different repo name
#   ./deploy.sh --private           private repo (needs a paid GitHub plan for Pages)
#   ./deploy.sh --no-wait           push and exit without following the run
#
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_NAME="$(basename "$PWD")"
VISIBILITY="public"
BRANCH="main"
MESSAGE="Update quiz scoreboard"
WORKFLOW="deploy.yml"
WAIT=1
DESCRIPTION="Client-side quiz scoreboard: 5 rounds, automatic totals and places."

usage() { sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--name)    REPO_NAME="${2:?missing repo name}"; shift 2 ;;
    -m|--message) MESSAGE="${2:?missing commit message}"; shift 2 ;;
    -b|--branch)  BRANCH="${2:?missing branch name}"; shift 2 ;;
    --private)    VISIBILITY="private"; shift ;;
    --public)     VISIBILITY="public"; shift ;;
    --no-wait)    WAIT=0; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is not installed."
command -v gh  >/dev/null || die "the GitHub CLI (gh) is not installed: https://cli.github.com"
gh auth status >/dev/null 2>&1 || die "gh is not logged in. Run: gh auth login"

[ -f index.html ] || die "no index.html here - GitHub Pages would serve an empty site."
[ -f ".github/workflows/$WORKFLOW" ] || die "missing .github/workflows/$WORKFLOW"

# Pushing a workflow file needs the 'workflow' token scope.
gh auth status 2>&1 | grep -q "'workflow'" \
  || die "your gh token lacks the 'workflow' scope. Run: gh auth refresh -s workflow"

OWNER="$(gh api user --jq .login)"
SLUG="$OWNER/$REPO_NAME"

# ---------------------------------------------------------------- local repo
if [ ! -d .git ]; then
  say "Initialising git repository"
  git init -q -b "$BRANCH"
fi

git add -A
if git diff --cached --quiet; then
  git rev-parse HEAD >/dev/null 2>&1 || die "nothing to commit."
  say "No changes to commit"
else
  say "Committing: $MESSAGE"
  git commit -q -m "$MESSAGE"
fi

git branch -M "$BRANCH"
SHA="$(git rev-parse HEAD)"

# --------------------------------------------------------------- GitHub repo
if git remote get-url origin >/dev/null 2>&1; then
  :
elif gh repo view "$SLUG" >/dev/null 2>&1; then
  say "Reusing existing repository $SLUG"
  git remote add origin "https://github.com/$SLUG.git"
else
  say "Creating $VISIBILITY repository $SLUG"
  gh repo create "$REPO_NAME" "--$VISIBILITY" \
    --source=. --remote=origin --description "$DESCRIPTION"
fi

say "Pushing $BRANCH"
git push -q -u origin "$BRANCH"

# --------------------------------------------------------------------- Pages
if [ "$VISIBILITY" = "private" ]; then
  echo "note: Pages on a private repo requires GitHub Pro/Team/Enterprise."
fi

# Build from the Actions workflow rather than from a branch. The workflow's
# configure-pages step can also do this, so a failure here is not fatal.
BODY='{"build_type":"workflow"}'
if gh api "repos/$SLUG/pages" >/dev/null 2>&1; then
  say "Setting Pages source to GitHub Actions"
  printf '%s' "$BODY" | gh api "repos/$SLUG/pages" -X PUT --input - >/dev/null \
    || echo "note: could not update the Pages source; the workflow will try."
else
  say "Enabling Pages (source: GitHub Actions)"
  printf '%s' "$BODY" | gh api "repos/$SLUG/pages" -X POST --input - >/dev/null \
    || echo "note: could not enable Pages here; the workflow will try."
fi

# ------------------------------------------------------------- follow the run
URL_OF() { gh api "repos/$SLUG/pages" --jq .html_url 2>/dev/null || true; }

if [ "$WAIT" -eq 0 ]; then
  say "Pushed. Watch it at https://github.com/$SLUG/actions"
  exit 0
fi

say "Waiting for the workflow run"
RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(gh run list --workflow "$WORKFLOW" --branch "$BRANCH" --limit 20 \
    --json databaseId,headSha --jq "map(select(.headSha == \"$SHA\")) | .[0].databaseId // empty" 2>/dev/null || true)"
  [ -n "$RUN_ID" ] && break
  sleep 3
done

if [ -z "$RUN_ID" ]; then
  say "No run found for $SHA (nothing new to deploy?)."
  say "Trigger one with: gh workflow run $WORKFLOW"
  [ -n "$(URL_OF)" ] && say "Current site: $(URL_OF)"
  exit 0
fi

if gh run watch "$RUN_ID" --exit-status; then
  URL="$(URL_OF)"
  [ -n "$URL" ] || URL="https://$OWNER.github.io/$REPO_NAME/"
  echo
  say "Live at $URL"
else
  die "the deploy run failed: https://github.com/$SLUG/actions/runs/$RUN_ID"
fi
