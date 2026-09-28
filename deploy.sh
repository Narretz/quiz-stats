#!/usr/bin/env bash
#
# Deploy this folder to GitHub Pages.
#
# Safe to run repeatedly: it initialises git on first run, creates the GitHub
# repo if it does not exist yet, turns Pages on if it is off, and afterwards
# just commits and pushes.
#
#   ./deploy.sh                     first run, or publish the latest changes
#   ./deploy.sh -m "Fix totals"     with a commit message
#   ./deploy.sh -n pub-quiz         use a different repo name
#   ./deploy.sh --private           private repo (needs a paid GitHub plan for Pages)
#
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_NAME="$(basename "$PWD")"
VISIBILITY="public"
BRANCH="main"
MESSAGE="Update quiz scoreboard"
DESCRIPTION="Client-side quiz scoreboard: 5 rounds, automatic totals and places."

usage() { sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--name)    REPO_NAME="${2:?missing repo name}"; shift 2 ;;
    -m|--message) MESSAGE="${2:?missing commit message}"; shift 2 ;;
    -b|--branch)  BRANCH="${2:?missing branch name}"; shift 2 ;;
    --private)    VISIBILITY="private"; shift ;;
    --public)     VISIBILITY="public"; shift ;;
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

OWNER="$(gh api user --jq .login)"
SLUG="$OWNER/$REPO_NAME"

# ---------------------------------------------------------------- local repo
if [ ! -d .git ]; then
  say "Initialising git repository"
  git init -q -b "$BRANCH"
fi

# Tell Pages not to run the files through Jekyll.
[ -f .nojekyll ] || touch .nojekyll

git add -A
if git diff --cached --quiet; then
  git rev-parse HEAD >/dev/null 2>&1 || die "nothing to commit."
  say "No changes to commit"
else
  say "Committing: $MESSAGE"
  git commit -q -m "$MESSAGE"
fi

git branch -M "$BRANCH"

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

say "Pushing to $BRANCH"
git push -q -u origin "$BRANCH"

# --------------------------------------------------------------------- Pages
if [ "$VISIBILITY" = "private" ]; then
  echo "note: Pages on a private repo requires GitHub Pro/Team/Enterprise."
fi

PAGES_BODY="$(printf '{"source":{"branch":"%s","path":"/"}}' "$BRANCH")"

if gh api "repos/$SLUG/pages" >/dev/null 2>&1; then
  say "Updating Pages source to $BRANCH (root)"
  printf '%s' "$PAGES_BODY" | gh api "repos/$SLUG/pages" -X PUT --input - >/dev/null
else
  say "Enabling GitHub Pages"
  printf '%s' "$PAGES_BODY" | gh api "repos/$SLUG/pages" -X POST --input - >/dev/null \
    || die "could not enable Pages. If this is a token scope problem, run: gh auth refresh -s repo"
fi

say "Waiting for the Pages build"
STATUS=""
for _ in $(seq 1 40); do
  STATUS="$(gh api "repos/$SLUG/pages/builds/latest" --jq .status 2>/dev/null || echo "")"
  case "$STATUS" in
    built)   break ;;
    errored) die "the Pages build failed. See: https://github.com/$SLUG/settings/pages" ;;
  esac
  sleep 5
done

URL="$(gh api "repos/$SLUG/pages" --jq .html_url 2>/dev/null || echo "https://$OWNER.github.io/$REPO_NAME/")"

echo
if [ "$STATUS" = "built" ]; then
  say "Live at $URL"
else
  say "Pushed. The first build can take a few minutes: $URL"
fi
