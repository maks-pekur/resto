-- 10.7 D-13: an order placed by a signed-in guest carries who they are, so "my orders" can be
-- answered. Nullable by design — D-14 keeps anonymous orders unowned and forbids a backfill,
-- because inventing an owner for a historical order is exactly the identity-matching this phase
-- refuses to do.

-- No composite FK: this points at a Better Auth user, which is not tenant-scoped, so ADR-0020 I-2
-- has nothing to say about it. Stated here so a later reader does not "fix" its absence.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_user_id text;
--> statement-breakpoint

-- The only shape this column is ever queried in: one guest's orders within one tenant (D-15).
CREATE INDEX IF NOT EXISTS orders_tenant_customer_user_idx
    ON public.orders (tenant_id, customer_user_id)
    WHERE customer_user_id IS NOT NULL;
