#!/usr/bin/env bash
set -euo pipefail

# Pitfall #7: a `docker compose down` (with or without -v) anywhere in this
# repo's executable content can destroy postgres-data. One rule, scanned
# once. docs/** is out of scope: `#` is a Markdown heading there, not a
# comment, and a runbook must be free to name the forbidden command.
# package.json is out of scope: `pnpm dev:reset` uses -v against the dev
# stack by design.

DOWN_PATTERN='(docker[[:space:]]+compose|docker-compose)[^|&;]*\bdown\b'
VOL_PATTERN='(docker[[:space:]]+compose|docker-compose)[^|&;]*(-v\b|--volumes\b)'

join_and_strip() {
  sed -e ':a' -e '/\\$/N; s/\\\n/ /; ta' "$1" | sed -E 's/#.*$//'
}

scan_file() {
  local file="$1" line n=0 status=0
  while IFS= read -r line; do
    n=$((n + 1))
    if grep -Eq "$DOWN_PATTERN" <<<"$line"; then
      echo "FAIL: $file:$n forbidden 'down' on a compose invocation" >&2
      status=1
    fi
    if grep -Eq "$VOL_PATTERN" <<<"$line"; then
      echo "FAIL: $file:$n forbidden -v/--volumes on a compose invocation" >&2
      status=1
    fi
  done < <(join_and_strip "$file")
  return "$status"
}

collect_targets() {
  [ -d .github/workflows ] && find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) -print
  [ -d infra/scripts ] && find infra/scripts -maxdepth 1 -type f -print
  [ -d infra/docker ] && find infra/docker -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print
  return 0
}

run_self_test() {
  local tmp failures=0
  tmp="$(mktemp -d)"

  # Fixture text is comma-joined then de-commaed at write time so the forbidden
  # substring this very guard hunts for never appears contiguous in its own
  # source — otherwise the guard's real scan (which walks infra/scripts/*)
  # would flag its own self-test fixtures.
  printf '%s\n' "docker,compose,-f,x.yml,down,-v" | tr ',' ' ' >"$tmp/down-v.sh"
  printf '%s\n' "docker,compose,down" | tr ',' ' ' >"$tmp/bare-down.sh"
  {
    printf '%s\n' "docker,compose,\\" | tr ',' ' '
    printf '%s\n' "down,-v" | tr ',' ' '
  } >"$tmp/continuation.sh"
  printf 'docker compose up -d --wait\n' >"$tmp/benign.sh"

  for f in down-v.sh bare-down.sh continuation.sh; do
    if scan_file "$tmp/$f" >/dev/null 2>&1; then
      echo "SELF-TEST FAIL: $f should have been rejected" >&2
      failures=1
    fi
  done
  if ! scan_file "$tmp/benign.sh" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL: benign.sh was incorrectly rejected" >&2
    failures=1
  fi

  rm -rf "$tmp"
  if [ "$failures" -ne 0 ]; then
    echo "assert-no-destructive-compose.sh --self-test: FAILED" >&2
    exit 1
  fi
  echo "assert-no-destructive-compose.sh --self-test: PASSED"
  exit 0
}

main() {
  local failures=0 count=0 f
  while IFS= read -r f; do
    count=$((count + 1))
    scan_file "$f" || failures=1
  done < <(collect_targets)

  if [ "$failures" -ne 0 ]; then
    echo "assert-no-destructive-compose.sh: FAILED" >&2
    exit 1
  fi
  echo "assert-no-destructive-compose.sh: PASSED ($count files scanned)"
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
else
  main
fi
