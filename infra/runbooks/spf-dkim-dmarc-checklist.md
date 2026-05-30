# SPF / DKIM / DMARC Pre-Deploy DNS Checklist (D-07)

**When:** Complete ALL steps BEFORE the first Phase 3 staging deploy that sends
operator invitation emails via Resend. Gmail silently marks messages as
`dmarc=fail` if any of these records are missing or misconfigured — invitation
emails will land in spam and operators will miss onboarding emails.

---

## Required DNS Records for `resto.app`

Add the following four TXT records in your DNS provider (Cloudflare, Route 53, etc.):

### 1. SPF

| Record type | Host / Name | Value |
|-------------|-------------|-------|
| TXT | `@` (root domain) | `v=spf1 include:_spf.resend.com -all` |

### 2. DKIM

| Record type | Host / Name | Value |
|-------------|-------------|-------|
| TXT | `resend._domainkey` | `v=DKIM1; k=rsa; p=<from Resend Dashboard>` |

> Get the DKIM public key from: **Resend Dashboard → Domains → resto.app → DKIM**.
> Copy the full `p=...` value (it is a long base64-encoded string).

### 3. DMARC

| Record type | Host / Name | Value |
|-------------|-------------|-------|
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@resto.app` |

### 4. Return-Path / Bounce domain (Resend requirement)

| Record type | Host / Name | Value |
|-------------|-------------|-------|
| CNAME | `bounce` | `feedback-smtp.us-east-1.amazonses.com` (verify in Resend Dashboard — region may differ) |

---

## Verification Commands

Run these AFTER DNS propagation (allow 5–60 minutes):

```bash
# SPF
dig TXT resto.app +short | grep spf

# DKIM
dig TXT resend._domainkey.resto.app +short

# DMARC
dig TXT _dmarc.resto.app +short
```

Expected outputs:

- SPF: `"v=spf1 include:_spf.resend.com -all"`
- DKIM: a long `v=DKIM1; k=rsa; p=...` string
- DMARC: `"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@resto.app"`

---

## End-to-End Email Test

1. Go to https://mail-tester.com and get a unique test address (e.g. `test-abc123@srv1.mail-tester.com`).
2. Trigger a test email from RestOS (e.g. invite the test address as a staff member on a test tenant).
3. Click "Check your score" on mail-tester.com.
4. Verify:
   - SPF: PASS
   - DKIM: PASS
   - DMARC: PASS
   - Score: 9/10 or higher

---

## Notes

- Do NOT deploy Phase 3 to staging or production until all three checks pass.
- The `RESEND_FROM` env var must match a verified domain in the Resend dashboard — ensure `noreply@resto.app` is a verified sender identity.
- DMARC `p=quarantine` is appropriate for initial deploy; upgrade to `p=reject` after 30 days of clean reports.
- `dmarc-reports@resto.app` must be a monitored mailbox. Forward to a shared inbox or use a DMARC reporting service (e.g. Postmark's DMARC Digests).
