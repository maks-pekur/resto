#!/usr/bin/env bash
set -uo pipefail

# The apex-parameterization guarantee, enforced once instead of per-plan.
# Primary net: exact `grep -F` for each of the three real apex values —
# exact and TLD-agnostic, so any apex is caught regardless of its TLD.
# Secondary net: a TLD-shaped regex, kept only as a backstop — it is not
# the guarantee.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST_FILE="${DOMAIN_LITERAL_ALLOWLIST:-$SCRIPT_DIR/domain-literal-allowlist.txt}"

EXCLUDE_PATTERNS=('*/node_modules/*' '*/dist/*' '*/.next/*' '*/coverage/*' '*/.git/*')

# Secondary net stays TLD-agnostic-ish by listing what an EU founder on
# Hetzner is plausibly on, not just the historical `app` fixture — but it
# is explicitly a backstop, not the guarantee (that is the exact match
# above). `\b` after the TLD group is load-bearing: without it the
# alternation matches as a prefix inside a longer identifier (e.g. `me`
# inside `import.meta`). `sh` (a real ccTLD) is deliberately excluded — in
# a shell-script-heavy infra repo it collides with every `*.sh` filename
# mention in prose and usage text, which would make the allowlist track
# routine script authorship instead of new domain literals.
TLD_REGEX='[a-zA-Z0-9-]+\.(app|com|dev|io|net|org|de|eu|ru|xyz|me|cloud|shop|ua|uk)\b'
THIRD_PARTY_ALLOWLIST=(ghcr.io docker.io github.com cloudflare.com rclone.org stripe.com resend.com)

resolve_apex() {
  local var="$1" val
  val="${!var:-}"
  if [ -n "$val" ]; then
    printf '%s' "$val"
    return 0
  fi
  if command -v gh >/dev/null 2>&1; then
    gh variable get "$var" 2>/dev/null || true
  fi
}

is_excluded() {
  local f="$1" pat
  for pat in "${EXCLUDE_PATTERNS[@]}"; do
    case "$f" in
      $pat) return 0 ;;
    esac
  done
  return 1
}

find_files() {
  local path="$1" f
  if [ -f "$path" ]; then
    is_excluded "$path" || printf '%s\n' "$path"
    return 0
  fi
  [ -d "$path" ] || return 0
  while IFS= read -r f; do
    is_excluded "$f" || printf '%s\n' "$f"
  done < <(find "$path" -type f 2>/dev/null)
}

is_third_party() {
  local match="$1" tp
  for tp in "${THIRD_PARTY_ALLOWLIST[@]}"; do
    case "$match" in
      *"$tp") return 0 ;;
    esac
  done
  return 1
}

is_allowlisted() {
  local entry="$1"
  [ -f "$ALLOWLIST_FILE" ] || return 1
  grep -qxF "$entry" "$ALLOWLIST_FILE" 2>/dev/null
}

scan_exact() {
  local apex="$1"
  shift
  local status=0 f ln rest
  [ -z "$apex" ] && return 0
  while IFS= read -r f; do
    if grep -qF -- "$apex" "$f" 2>/dev/null; then
      while IFS=: read -r ln rest; do
        [ -z "${ln:-}" ] && continue
        echo "FAIL(exact): $f:$ln contains apex literal '$apex'" >&2
      done < <(grep -noF -- "$apex" "$f" 2>/dev/null)
      status=1
    fi
  done < <(for p in "$@"; do find_files "$p"; done)
  return "$status"
}

scan_tld() {
  local status=0 f ln match
  while IFS= read -r f; do
    while IFS=: read -r ln match; do
      [ -z "${ln:-}" ] && continue
      is_third_party "$match" && continue
      is_allowlisted "$f:$ln" && continue
      echo "FAIL(tld): $f:$ln matched '$match' (not allowlisted)" >&2
      status=1
    done < <(grep -noE "$TLD_REGEX" "$f" 2>/dev/null)
  done < <(for p in "$@"; do find_files "$p"; done)
  return "$status"
}

run_self_test() {
  local tmp failures=0
  tmp="$(mktemp -d)"
  local pub="${PUBLIC_APEX_DOMAIN:-example.invalid}"
  local admin="${ADMIN_APEX_DOMAIN:-admin.invalid}"
  local guest="${GUEST_APEX_DOMAIN:-guest.invalid}"

  echo "nothing interesting here" >"$tmp/clean.txt"
  echo "literal $pub appears here" >"$tmp/pub.txt"
  echo "literal $admin appears here" >"$tmp/admin.txt"
  echo "literal $guest appears here" >"$tmp/guest.txt"
  echo "https://ghcr.io/owner/image and https://stripe.com/x" >"$tmp/thirdparty.txt"
  # "!" stands in for the dot so this fixture's domain-shaped text never
  # appears literally in this file's own source — otherwise this guard's
  # real scan (which walks infra/scripts/*) would flag its own fixture.
  printf '%s\n' "unexpected-domain!de here" | tr '!' '.' >"$tmp/tldhit.txt"

  if scan_exact "$pub" "$tmp/pub.txt"; then
    echo "SELF-TEST FAIL: pub.txt should have been rejected" >&2
    failures=1
  fi
  if scan_exact "$admin" "$tmp/admin.txt"; then
    echo "SELF-TEST FAIL: admin.txt should have been rejected" >&2
    failures=1
  fi
  if scan_exact "$guest" "$tmp/guest.txt"; then
    echo "SELF-TEST FAIL: guest.txt should have been rejected" >&2
    failures=1
  fi
  if ! scan_exact "$pub" "$tmp/clean.txt"; then
    echo "SELF-TEST FAIL: clean.txt incorrectly rejected" >&2
    failures=1
  fi
  if ! scan_tld "$tmp/thirdparty.txt"; then
    echo "SELF-TEST FAIL: thirdparty.txt incorrectly rejected by TLD net" >&2
    failures=1
  fi
  if scan_tld "$tmp/tldhit.txt"; then
    echo "SELF-TEST FAIL: tldhit.txt should have been rejected by TLD net" >&2
    failures=1
  fi

  rm -rf "$tmp"
  if [ "$failures" -ne 0 ]; then
    echo "assert-no-domain-literals.sh --self-test: FAILED" >&2
    exit 1
  fi
  echo "assert-no-domain-literals.sh --self-test: PASSED"
  exit 0
}

main() {
  local paths=("$@")
  if [ "${#paths[@]}" -eq 0 ]; then
    paths=(.)
  fi

  local public admin guest mode failures=0
  public="$(resolve_apex PUBLIC_APEX_DOMAIN)"
  admin="$(resolve_apex ADMIN_APEX_DOMAIN)"
  guest="$(resolve_apex GUEST_APEX_DOMAIN)"

  if [ -n "$public" ] && [ -n "$admin" ] && [ -n "$guest" ]; then
    mode="exact+tld"
  else
    mode="degraded-tld-only"
  fi
  echo "assert-no-domain-literals.sh: mode=$mode" >&2

  if [ "$mode" = "exact+tld" ]; then
    scan_exact "$public" "${paths[@]}" || failures=1
    scan_exact "$admin" "${paths[@]}" || failures=1
    scan_exact "$guest" "${paths[@]}" || failures=1
  else
    echo "assert-no-domain-literals.sh: apex variables unavailable — running TLD-regex net only" >&2
  fi

  scan_tld "${paths[@]}" || failures=1

  if [ "$failures" -ne 0 ]; then
    echo "assert-no-domain-literals.sh: FAILED" >&2
    exit 1
  fi
  echo "assert-no-domain-literals.sh: PASSED"
  exit 0
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
else
  main "$@"
fi
