-- Remove non-unique indexes that exactly duplicate constraint-backed unique indexes.
-- The unique indexes continue to support equality lookups while enforcing uniqueness.
DROP INDEX IF EXISTS public.idx_ads_phone;
DROP INDEX IF EXISTS public.idx_payments_idempotency;
