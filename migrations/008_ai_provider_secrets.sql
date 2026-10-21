-- Store AI provider API keys outside system_config and deny all public/client roles.
-- The Express runtime connects as masterboy_app and is the only application role
-- granted access. API keys are never exposed through the browser API.
CREATE TABLE IF NOT EXISTS public.server_secrets (
  secret_name TEXT PRIMARY KEY CHECK (secret_name = 'ai_provider'),
  secret_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.server_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_secrets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.server_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.server_secrets TO masterboy_app;

DROP POLICY IF EXISTS masterboy_server_secrets_access ON public.server_secrets;
CREATE POLICY masterboy_server_secrets_access
  ON public.server_secrets
  FOR ALL TO masterboy_app
  USING (true)
  WITH CHECK (true);
