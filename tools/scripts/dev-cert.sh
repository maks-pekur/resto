#!/usr/bin/env bash
# Mints the local TLS certificate the guest dev servers use, covering this machine's current
# LAN address. Re-run it after switching network — the address is baked into the certificate.
set -euo pipefail

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed — run: brew install mkcert" >&2
  exit 1
fi

ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$ip" ]; then
  echo "No LAN address on en0/en1 — connect to Wi-Fi or a hotspot first." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
dir="$root/infra/dev-certs"
mkdir -p "$dir"

mkcert -cert-file "$dir/dev.pem" -key-file "$dir/dev-key.pem" \
  localhost 127.0.0.1 ::1 '*.lvh.me' '*.menu.lvh.me' \
  "$ip" "$ip.nip.io" "*.$ip.nip.io" "*.menu.$ip.nip.io" >/dev/null

echo "Certificate written for $ip"
echo
echo "  QR menu on this phone:  https://pizza.menu.$ip.nip.io:3003"
echo "  Trust it on the phone:  $(mkcert -CAROOT)/rootCA.pem"
