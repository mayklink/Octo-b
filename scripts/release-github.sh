#!/usr/bin/env bash
set -euo pipefail

# ── Colors & helpers ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}▶${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
fatal() { err "$1"; exit 1; }

# ── Parse flags ──────────────────────────────────────────────────
AUTO_YES=false
SKIP_FINALIZE=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
    --no-finalize) SKIP_FINALIZE=true ;;
    *) fatal "Unknown argument: $arg" ;;
  esac
done
 
if $AUTO_YES; then
  warn "Auto-accepting all prompts (-y)"
fi
if $SKIP_FINALIZE; then
  warn "Finalize job will be skipped (release stays as draft)"
fi

# ── Constants ─────────────────────────────────────────────────────
REPO="morapelker/octob"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKFLOW_FILE="release-github.yml"

# ── Preflight ────────────────────────────────────────────────────
info "Running preflight checks..."

cd "$PROJECT_DIR"

# Check gh CLI is authenticated
gh auth status &>/dev/null || fatal "gh CLI is not authenticated. Run 'gh auth login' first."
ok "gh CLI authenticated"

# Check clean working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
 fatal "Working tree has uncommitted changes. Commit or stash them first."
fi
ok "Clean working tree"

# Pull latest from remote
info "Pulling latest changes..."
git pull || fatal "git pull failed"
ok "Up to date with remote"

# Check we're on main
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
 warn "You are on branch '$CURRENT_BRANCH', not 'main'."
 if ! $AUTO_YES; then
   read -rp "Continue anyway? [Y/n] " confirm
   [[ "$confirm" =~ ^[Nn]$ ]] && exit 1
 fi
fi

# ── Version bump ─────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('./package.json').version")
SUGGESTED_VERSION=$(node -p "
 const [major, minor, patch] = '${CURRENT_VERSION}'.split('.').map(Number);
 \`\${major}.\${minor}.\${patch + 1}\`
" 2>/dev/null || echo "")
info "Current version: ${YELLOW}v${CURRENT_VERSION}${NC}"

if $AUTO_YES; then
 if [[ -n "$SUGGESTED_VERSION" ]]; then
   NEW_VERSION="$SUGGESTED_VERSION"
   ok "Auto-accepting version: ${NEW_VERSION}"
 else
   fatal "Cannot auto-accept version: no suggested version available"
 fi
elif [[ -n "$SUGGESTED_VERSION" ]]; then
 read -rp "Enter new version number (without 'v' prefix) [${SUGGESTED_VERSION}]: " NEW_VERSION
 NEW_VERSION="${NEW_VERSION:-$SUGGESTED_VERSION}"
else
 read -rp "Enter new version number (without 'v' prefix, e.g. 1.0.18): " NEW_VERSION
fi
if [[ -z "$NEW_VERSION" ]]; then
 fatal "No version provided."
fi
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-.+)?$ ]]; then
  fatal "Invalid version format: '${NEW_VERSION}'. Expected semver like 1.0.18 or 1.0.18-rc.1"
fi
if [[ "$NEW_VERSION" == "$CURRENT_VERSION" ]]; then
 fatal "New version is the same as current version."
fi

# ── Confirmation ─────────────────────────────────────────────────
echo ""
info "Will release: ${YELLOW}v${CURRENT_VERSION}${NC} → ${GREEN}v${NEW_VERSION}${NC}"
info "This will:"
echo "  1. Bump package.json to ${NEW_VERSION}"
echo "  2. Commit, tag v${NEW_VERSION}, and push to origin"
echo "  3. Trigger GitHub Actions to build macOS, Windows, and Linux"
echo "  4. Publish all artifacts to GitHub Release v${NEW_VERSION}"
echo "  5. Update Homebrew cask (official + custom tap, automated in CI)"
echo ""
if ! $AUTO_YES; then
 read -rp "Proceed? [Y/n] " confirm
 [[ "$confirm" =~ ^[Nn]$ ]] && { info "Aborted."; exit 0; }
fi

# ── Version bump + git ───────────────────────────────────────────
info "Bumping version to ${NEW_VERSION}..."

node -e "
 const fs = require('fs');
 const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
 pkg.version = '${NEW_VERSION}';
 fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
ok "package.json updated"

git add package.json
git commit -m "release: v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
ok "Tagged v${NEW_VERSION}"

info "Pushing to origin..."
git push origin "$CURRENT_BRANCH"
git push origin "v${NEW_VERSION}"
ok "Pushed commit and tag"

# ── Trigger CI workflow ──────────────────────────────────────────
info "Triggering CI workflow..."
if $SKIP_FINALIZE; then
  gh workflow run "$WORKFLOW_FILE" --ref "v${NEW_VERSION}" -f skip_finalize=true
else
  gh workflow run "$WORKFLOW_FILE" --ref "v${NEW_VERSION}"
fi

# Brief pause to let GitHub register the run
sleep 3
RUN_URL=$(gh run list --workflow="$WORKFLOW_FILE" --limit=1 --json url --jq '.[0].url')

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Release v${NEW_VERSION} triggered!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "  Workflow run: ${RUN_URL:-"(check GitHub Actions)"}"
echo ""
echo "  Builds will run on GitHub-hosted runners:"
echo "    - macOS (arm64 + x64) — sign + notarize"
echo "    - Windows (x64)       — NSIS installer + portable"
echo "    - Linux (x64)         — AppImage + deb + tar.gz"
echo ""
if $SKIP_FINALIZE; then
  echo "  The release will remain as a DRAFT (--no-finalize)."
  echo "  When ready, run: yarn release:finalize ${NEW_VERSION}"
else
  echo "  The release will be un-drafted automatically when all builds complete."
fi
echo "  GitHub Release: https://github.com/${REPO}/releases/tag/v${NEW_VERSION}"
echo ""
