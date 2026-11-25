-- Extend the existing secret-name allowlist without changing table access.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.server_secrets
  DROP CONSTRAINT server_secrets_secret_name_check,
  ADD CONSTRAINT server_secrets_secret_name_check
    CHECK (secret_name IN ('ai_provider', 'provider_config', 'payment_credentials'));

COMMIT;
