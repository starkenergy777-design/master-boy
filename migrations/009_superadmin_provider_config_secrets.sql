-- Allow additional server-side configuration bundles in the restricted secret store.
-- These remain inaccessible to anon/authenticated and are only read by masterboy_app.
ALTER TABLE public.server_secrets
  DROP CONSTRAINT IF EXISTS server_secrets_secret_name_check;

ALTER TABLE public.server_secrets
  ADD CONSTRAINT server_secrets_secret_name_check
  CHECK (secret_name IN ('ai_provider', 'provider_config'));
