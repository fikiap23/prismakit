#!/usr/bin/env bash
# Copy PrismaKit Cursor skills into ~/.cursor/skills (default) or a project
# .cursor/skills directory (--project [path]).
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--project [APP_ROOT]]

  (no flags)             Install to ~/.cursor/skills/
  --project              Install to ./.cursor/skills/ (cwd)
  --project APP_ROOT     Install to APP_ROOT/.cursor/skills/
  -h, --help             Show this help

Never installs into ~/.cursor/skills-cursor/ (Cursor built-ins).
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SRC="$(cd "${SCRIPT_DIR}/.." && pwd)"
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

# Guard: never write into Cursor's built-in skills directory.
case "${DEST}" in
  "${HOME}/.cursor/skills-cursor"|"${HOME}/.cursor/skills-cursor/"*)
    echo "Refusing to install into ${DEST} (reserved for Cursor built-ins)." >&2
    exit 1
    ;;
esac

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
  # Portable recursive copy (no rsync required).
  cp -R "${src}/." "${dst}/"
  echo "Installed ${name} -> ${dst}"
done

echo "Done. Destination: ${DEST}"
