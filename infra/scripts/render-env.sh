#!/usr/bin/env bash
set -euo pipefail

# Measured against the installed Docker Compose (v5.1.2): `env_file:`
# *does* now interpolate `${...}` against the invoking shell's environment
# (a scratch `FOO=${X}` resolves, not the literal, under `docker compose
# config`) — this script's job is not working around a missing feature, it
# is producing a self-contained, mode-600 file so the real values do not
# have to stay exported in the shell/systemd unit that runs `docker compose
# up` on the box, and refusing a placeholder value or an accidental
# overwrite of already-rotated secrets.

PLACEHOLDER_MARKERS=(replace_me replace-me change_me change-me CHANGE_ME)

usage() {
  echo "usage: render-env.sh <template> <target> [--force]" >&2
  exit 1
}

TEMPLATE="${1:-}"
TARGET="${2:-}"
FORCE_FLAG="${3:-}"

[ -n "$TEMPLATE" ] || usage
[ -n "$TARGET" ] || usage
[ -f "$TEMPLATE" ] || {
  echo "render-env.sh: template not found: $TEMPLATE" >&2
  exit 1
}

if [ -z "${PUBLIC_APEX_DOMAIN:-}" ]; then
  echo "render-env.sh: PUBLIC_APEX_DOMAIN is unset — refusing to render" >&2
  exit 1
fi

lower="$(printf '%s' "$PUBLIC_APEX_DOMAIN" | tr '[:upper:]' '[:lower:]')"
for marker in "${PLACEHOLDER_MARKERS[@]}"; do
  marker_lower="$(printf '%s' "$marker" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *"$marker_lower"*)
      echo "render-env.sh: PUBLIC_APEX_DOMAIN looks like an unreplaced placeholder: $PUBLIC_APEX_DOMAIN" >&2
      exit 1
      ;;
  esac
done

if [ -e "$TARGET" ] && [ "$FORCE_FLAG" != "--force" ]; then
  echo "render-env.sh: $TARGET already exists — pass --force to overwrite (a redeploy must not silently clobber rotated secrets)" >&2
  exit 1
fi

command -v envsubst >/dev/null 2>&1 || {
  echo "render-env.sh: envsubst not found (gettext-base package)" >&2
  exit 1
}

umask 177
envsubst <"$TEMPLATE" >"$TARGET"
chmod 600 "$TARGET"
echo "render-env.sh: rendered $TEMPLATE -> $TARGET (mode 600)"
