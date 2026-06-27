#!/usr/bin/env bash
set -euo pipefail

# speckit-sdd Installer — Linux / macOS / Git Bash
# Usage: curl -fsSL https://raw.githubusercontent.com/<user>/speckit-sdd/main/install.sh | bash
# Or:   ./install.sh

REPO="<user>/speckit-sdd"
BRANCH="main"
CONFIG_DIR="${HOME}/.config/opencode"
TMP_DIR=$(mktemp -d)

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "==> Cloning speckit-sdd (${BRANCH})..."
git clone --depth 1 --branch "${BRANCH}" "https://github.com/${REPO}.git" "${TMP_DIR}/speckit-sdd"

echo "==> Installing templates..."
mkdir -p "${CONFIG_DIR}/templates"
cp -r "${TMP_DIR}/speckit-sdd/templates/"* "${CONFIG_DIR}/templates/"

echo "==> Installing skills..."
mkdir -p "${CONFIG_DIR}/skills"
for d in "${TMP_DIR}/speckit-sdd/skills/"*/; do
  skill_name=$(basename "$d")
  target="${CONFIG_DIR}/skills/${skill_name}"
  mkdir -p "$target"
  cp -r "${d}"* "$target"
done

echo "==> Installing tools..."
mkdir -p "${CONFIG_DIR}/tools"
cp -r "${TMP_DIR}/speckit-sdd/tools/"* "${CONFIG_DIR}/tools/"

echo "==> Installing AGENTS.md..."
cp "${TMP_DIR}/speckit-sdd/AGENTS.md" "${CONFIG_DIR}/AGENTS.md"

echo ""
echo "==> Done! speckit-sdd installed to ${CONFIG_DIR}"
echo "    Restart opencode to load new tools and skills."
echo "    Run /status to verify."
