CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uq
  ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
