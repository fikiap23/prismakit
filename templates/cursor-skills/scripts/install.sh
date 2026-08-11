#!/usr/bin/env bash
# Copy PrismaKit agent skills into ~/.cursor/skills (default) or a project
# .cursor/skills directory (--project [path]).
#
# Prefer: npx prismakit skills
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--project [APP_ROOT]]

  (no flags)             Install to ~/.cursor/skills/
  --project              Install to ./.cursor/skills/ (cwd)
  --project APP_ROOT     Install to APP_ROOT/.cursor/skills/
  -h, --help             Show this help

Prefer `npx prismakit skills` (or `npx prismakit skills --global`).
Never installs into ~/.cursor/skills-cursor/ (Cursor built-ins).
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SKILLS_SRC="${REPO_ROOT}/skills"
SKILL_NAMES=(prismakit prismakit-nestjs)

DEST=""
PROJECT_MODE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --project)
      PROJECT_MODE=1
      if [[ $# -ge 2 && "${2}" != -* ]]; then
        DEST="${2}/.cursor/skills"
        shift 2
      else
        DEST="${PWD}/.cursor/skills"
        shift
      fi
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${PROJECT_MODE}" -eq 0 ]]; then
  DEST="${HOME}/.cursor/skills"
fi

case "${DEST}" in
  "${HOME}/.cursor/skills-cursor"|"${HOME}/.cursor/skills-cursor/"*)
    echo "Refusing to install into ${DEST} (reserved for Cursor built-ins)." >&2
    exit 1
    ;;
esac

if [[ ! -d "${SKILLS_SRC}/prismakit" ]]; then
  echo "Missing skills source: ${SKILLS_SRC}" >&2
  echo "Run this from a prismakit git clone, or use: npx prismakit skills" >&2
  exit 1
fi

mkdir -p "${DEST}"

for name in "${SKILL_NAMES[@]}"; do
  src="${SKILLS_SRC}/${name}"
  dst="${DEST}/${name}"
  if [[ ! -d "${src}" ]]; then
    echo "Missing skill source: ${src}" >&2
    exit 1
  fi
  rm -rf "${dst}"
  mkdir -p "${dst}"
  cp -R "${src}/." "${dst}/"
  echo "Installed ${name} -> ${dst}"
done

echo "Done. Destination: ${DEST}"
echo "Tip: npx prismakit skills   # same install, from the published CLI"
