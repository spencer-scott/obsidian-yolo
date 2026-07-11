#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# YOLO Plugin Update Script
# Pulls upstream changes, translates Chinese, builds, and deploys to vault.
#
# Usage:
#   ./scripts/update-yolo.sh              # Full update: merge + build + deploy
#   ./scripts/update-yolo.sh --build-only # Skip merge, just build and deploy
#   ./scripts/update-yolo.sh --check      # Check for upstream updates only
# =============================================================================

REPO_DIR="${REPO_DIR:-$HOME/Documents/obsidian/plugins/obsidian-yolo}"
VAULT_DIR="${VAULT_DIR:-$HOME/Documents/obsidian/vaults/vault}"
PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/yolo"
BRANCH="english-translation"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[YOLO]${NC} $1"; }
warn() { echo -e "${YELLOW}[YOLO]${NC} $1"; }
err()  { echo -e "${RED}[YOLO]${NC} $1" >&2; }
info() { echo -e "${BLUE}[YOLO]${NC} $1"; }

quit_obsidian() {
  if pgrep -x "Obsidian" > /dev/null 2>&1; then
    log "Quitting Obsidian..."
    osascript -e 'tell application "Obsidian" to quit' 2>/dev/null || true
    sleep 2
    if pgrep -x "Obsidian" > /dev/null 2>&1; then
      warn "Obsidian still running, force quitting..."
      pkill -x "Obsidian" || true
      sleep 1
    fi
    log "Obsidian closed."
  else
    log "Obsidian is not running."
  fi
}

open_obsidian() {
  log "Opening Obsidian..."
  open -a "Obsidian" 2>/dev/null || warn "Could not open Obsidian automatically."
}

check_upstream() {
  cd "$REPO_DIR"
  git fetch upstream 2>/dev/null
  local count
  count=$(git rev-list "${BRANCH}..upstream/main" --count 2>/dev/null || echo 0)
  if [ "$count" -eq 0 ]; then
    log "No new upstream commits."
    return 1
  else
    log "$count new upstream commit(s) available:"
    git log "${BRANCH}..upstream/main" --oneline | head -20
    return 0
  fi
}

merge_upstream() {
  cd "$REPO_DIR"
  git checkout "$BRANCH" 2>/dev/null

  log "Merging upstream/main..."
  if ! git merge upstream/main --no-edit 2>&1; then
    err "Merge conflicts detected!"
    echo ""
    warn "Files with conflicts:"
    git diff --name-only --diff-filter=U
    echo ""
    warn "Run 'claude' in $REPO_DIR to resolve conflicts and translate."
    warn "Tell Claude: 'Resolve merge conflicts and translate new Chinese to English'"
    exit 1
  fi

  log "Merge successful (no conflicts)."
}

# Emit every source line containing Chinese that is NOT allowlisted.
# Lines allowed to keep Chinese are excluded here:
#   - src/i18n/locales/zh.ts  the Chinese locale bundle (entirely intentional)
#   - *.test.ts / *.test.tsx  CJK fixtures; `npm test` guards their correctness
#   - any line tagged `i18n-keep`  intentional Chinese in otherwise-English
#                                  source (CJK-detection regexes, the 中文
#                                  language label, legacy persisted values)
# To intentionally keep a Chinese line, add a trailing `// i18n-keep: <reason>`
# comment (or `/* i18n-keep */` inside JSX braces / CSS).
chinese_hits() {
  cd "$REPO_DIR"
  grep -rn '[一-鿿㐀-䶿]' src/ --include='*.ts' --include='*.tsx' --include='*.css' \
    | grep -v 'i18n/locales/zh.ts' \
    | grep -vE '\.test\.tsx?:' \
    | grep -v 'i18n-keep' \
    || true
}

scan_chinese() {
  local hits count
  hits=$(chinese_hits)
  if [ -z "$hits" ]; then
    count=0
  else
    count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
  fi

  if [ "$count" -gt 0 ]; then
    warn "$count line(s) of untranslated Chinese found!"
    echo ""
    warn "Run 'claude' in $REPO_DIR to translate."
    warn "Tell Claude: 'Translate all new Chinese to English, then build and deploy'"
    warn "(If a line is intentional — a CJK regex, a language label — tag it 'i18n-keep'.)"
    echo ""
    printf '%s\n' "$hits" | sed 's/:.*$//' | sort | uniq -c | sort -rn | head -20
    return 1
  else
    log "No untranslated Chinese detected."
    return 0
  fi
}

build_plugin() {
  cd "$REPO_DIR"
  log "Installing dependencies..."
  npm install --silent 2>&1 | tail -1

  log "Building plugin..."
  if ! npm run build 2>&1 | tail -3; then
    err "Build failed!"
    exit 1
  fi

  if [ ! -f "main.js" ]; then
    err "main.js not found after build!"
    exit 1
  fi

  log "Build successful. main.js: $(du -h main.js | cut -f1)"
}

deploy_plugin() {
  if [ ! -d "$PLUGIN_DIR" ]; then
    err "Plugin directory not found: $PLUGIN_DIR"
    err "Make sure the YOLO plugin was installed at least once."
    exit 1
  fi

  log "Deploying to $PLUGIN_DIR..."
  cp "$REPO_DIR/main.js" "$PLUGIN_DIR/main.js"
  cp "$REPO_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
  cp "$REPO_DIR/styles.css" "$PLUGIN_DIR/styles.css"
  log "Deployed: main.js, manifest.json, styles.css"

  local version
  version=$(grep '"version"' "$PLUGIN_DIR/manifest.json" | sed 's/.*: *"\(.*\)".*/\1/')
  log "Plugin version: $version"
}

# --- Main ---

MODE="${1:-full}"

case "$MODE" in
  --check)
    log "Checking for upstream updates..."
    check_upstream || true
    exit 0
    ;;
  --build-only)
    log "Build-only mode (skipping merge)..."
    quit_obsidian
    build_plugin
    deploy_plugin
    open_obsidian
    log "Done!"
    ;;
  *)
    log "Full update: merge + translate check + build + deploy"
    echo ""

    if ! check_upstream; then
      log "Already up to date. Nothing to do."
      exit 0
    fi

    echo ""
    quit_obsidian
    merge_upstream

    if ! scan_chinese; then
      err "New Chinese text needs translation before deploying."
      err "Open Claude Code in $REPO_DIR and ask it to translate."
      err "Then run: $0 --build-only"
      exit 1
    fi

    build_plugin
    deploy_plugin
    open_obsidian

    echo ""
    log "Update complete!"
    ;;
esac
