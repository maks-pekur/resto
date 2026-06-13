# 2FA Recovery Runbook (D-23)

**When to use:** An operator has lost access to their 2FA device and cannot sign in.
This is the sole-owner recovery path. Subordinate-operator reset moves to Phase 17 / TEAM-04.

---

## Prerequisites

1. Verify the operator's identity out-of-band before proceeding:
   - Video call or phone call confirming voice + face
   - Cross-reference the account email against the original signup email on file
   - Log the verification method and timestamp in your support notes

2. Have `DATABASE_URL` (the write-capable `resto_app` DSN) available.

---

## Recovery Steps

### Step 1 — Dry run (preview SQL, no changes)

```bash
pnpm exec tsx scripts/reset-2fa.ts --user-id <UUID> --dry-run
```

Review the output:

- Confirm the `userId`, email, and tenant affiliation match the caller.
- Confirm the session count that will be revoked.

### Step 2 — Execute reset

```bash
pnpm exec tsx scripts/reset-2fa.ts --user-id <UUID>
```

The script prompts `Confirm reset for <email>? (y/N)`. Type `y` and press Enter.

**What the script does (single transaction):**

1. `UPDATE user SET twoFactorEnabled = false WHERE id = ?`
2. `DELETE FROM two_factor WHERE userId = ?` — removes TOTP secret + backup codes
3. `DELETE FROM session WHERE userId = ?` — force re-login on all devices
4. `INSERT INTO audit_log` row with:
   - `action = 'identity.two_factor_reset_manual'`
   - `actorSubject = 'founder:manual:<your-email>'`
   - `targetType = 'user'`
   - `targetId = <userId>`
   - `payload = { reason: 'lost-device-recovery', resetAt: <ISO timestamp> }`

### Step 3 — Notify the operator

Send this message via the support channel:

> Hi [Name], we've disabled 2FA on your account as requested.
> Please sign in at https://admin.resto.app and re-enable 2FA from
> Dashboard → Settings → Security as soon as possible.
> This reset has been audited.

---

## Verification

After the script completes, verify the audit row was written:

```sql
SELECT action, actor_subject, target_id, payload, created_at
FROM audit_log
WHERE action = 'identity.two_factor_reset_manual'
  AND target_id = '<userId>'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Notes

- The audit row is forensic — do not delete it.
- If the script fails mid-transaction, no changes are committed (the script uses a single DB transaction).
- This runbook does NOT apply if the operator still has valid backup codes — direct them to use a backup code instead.
