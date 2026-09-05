#!/usr/bin/env bash
set -uo pipefail

# Cloudflare's free Universal SSL covers the root domain and first-level
# subdomains only, not deeper subdomains
# (developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).
# A hostname more than one label above its apex is not a style violation —
# it is a host the browser refuses to connect to. This check is static and
# computed from configuration; it does not itself prove the certificate
# covers a host (that is the live handshake in plan 08's --stage full).

HOST_KEYS=(
  API_HOST WEBSITE_HOST ADMIN_WEB_URL
  WEBSITE_PUBLIC_URL MEDIA_PUBLIC_BASE_URL STRIPE_CONNECT_RETURN_URL
  STRIPE_CONNECT_REFRESH_URL AUTH_COOKIE_DOMAIN CORS_ALLOWED_ORIGINS
)

strip_scheme_and_wildcard() {
  local v="$1"
  v="${v#https://}"
  v="${v#http://}"
  v="${v#\*.}"
  v="${v#.}"
  v="${v%%/*}"
  v="${v%%:*}"
  printf '%s' "$v"
}

label_count() {
  awk -F. '{print NF}' <<<"$1"
}

check_host() {
  local host="$1" key="$2" apex="$PUBLIC_APEX_DOMAIN" matched="" hc ac depth
  [ -z "$host" ] && return 0
  if [ -n "$apex" ] && { [ "$host" = "$apex" ] || [[ "$host" == *".$apex" ]]; }; then
    matched="$apex"
  fi
  if [ -z "$matched" ]; then
    echo "FAIL: $key=$host does not end with the configured apex" >&2
    return 1
  fi
  hc="$(label_count "$host")"
  ac="$(label_count "$matched")"
  depth=$((hc - ac))
  if [ "$depth" -gt 1 ]; then
    echo "FAIL: $key=$host is $depth label(s) above its apex '$matched' (max 1)" >&2
    return 1
  fi
  return 0
}

scan_env_file() {
  local file="$1" status=0 key value entry
  while IFS='=' read -r key value; do
    case " ${HOST_KEYS[*]} " in
      *" $key "*) ;;
      *) continue ;;
    esac
    value="${value%\"}"
    value="${value#\"}"
    if [ "$key" = "CORS_ALLOWED_ORIGINS" ]; then
      IFS=',' read -ra entries <<<"$value"
      for entry in "${entries[@]}"; do
        check_host "$(strip_scheme_and_wildcard "$entry")" "$key" || status=1
      done
    else
      check_host "$(strip_scheme_and_wildcard "$value")" "$key" || status=1
    fi
  done <"$file"
  return "$status"
}

run_self_test() {
  local tmp failures=0
  tmp="$(mktemp -d)/env"
  local pub="${PUBLIC_APEX_DOMAIN:-example.invalid}"

  {
    echo "API_HOST=api.$pub"
    echo "ADMIN_WEB_URL=https://$pub/admin"
    echo "CORS_ALLOWED_ORIGINS=https://$pub,https://*.$pub"
  } >"$tmp"
  if ! scan_env_file "$tmp"; then
    echo "SELF-TEST FAIL: valid depth-<=1 fixture was incorrectly rejected" >&2
    failures=1
  fi

  local bad="${tmp}.bad"
  echo "API_HOST=pizza.menu.$pub" >"$bad"
  if scan_env_file "$bad"; then
    echo "SELF-TEST FAIL: pizza.menu.$pub (depth 2) should have been rejected" >&2
    failures=1
  fi

  local none="${tmp}.none"
  echo "API_HOST=api.totally-unconfigured-host.invalid" >"$none"
  if scan_env_file "$none"; then
    echo "SELF-TEST FAIL: a host matching no apex should have been rejected" >&2
    failures=1
  fi

  rm -rf "$(dirname "$tmp")" "$bad" "$none"
  if [ "$failures" -ne 0 ]; then
    echo "assert-hostname-depth.sh --self-test: FAILED" >&2
    exit 1
  fi
  echo "assert-hostname-depth.sh --self-test: PASSED"
  exit 0
}

main() {
  local file="${1:-}"
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "assert-hostname-depth.sh: usage: assert-hostname-depth.sh <rendered-env-file>" >&2
    exit 1
  fi
  if ! scan_env_file "$file"; then
    echo "assert-hostname-depth.sh: FAILED" >&2
    exit 1
  fi
  echo "assert-hostname-depth.sh: PASSED"
  exit 0
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
else
  main "$@"
fi
