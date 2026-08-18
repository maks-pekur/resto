-- Better Auth's organization plugin writes invitation.createdAt; without the
-- column every invite fails at the adapter with a 500, after the permission
-- check has already passed.

ALTER TABLE invitation ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
