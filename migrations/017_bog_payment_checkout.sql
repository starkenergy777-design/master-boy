-- Keep the bank order and in-flight checkout alongside the existing payment ledger.
-- The existing payment_intents RLS and backend role grants also cover this column.
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS provider_checkout JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bog_checkout_bank_order
  ON public.payment_intents ((provider_checkout->>'environment'), provider_transaction_id)
  WHERE provider_checkout IS NOT NULL AND provider_transaction_id IS NOT NULL;
