-- Runtime fields used by the Express application, plus a server-only DB role.
-- Existing business data is preserved; no tables or rows are dropped.

ALTER TABLE public.craftsmen
  ADD COLUMN IF NOT EXISTS bank_account TEXT;

ALTER TABLE public.top15_reservations
  ADD COLUMN IF NOT EXISTS amount_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'GEL';

ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS config_unlock_hash TEXT;

CREATE TABLE IF NOT EXISTS public.ai_reports (
  id VARCHAR(64) PRIMARY KEY,
  report_type VARCHAR(32) NOT NULL,
  craftsman_id VARCHAR(64),
  craftsman_name VARCHAR(150),
  period_from TIMESTAMPTZ,
  period_to TIMESTAMPTZ,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.listing_purge_logs (
  id VARCHAR(64) PRIMARY KEY,
  craftsman_id VARCHAR(64) NOT NULL,
  city_id VARCHAR(64) NOT NULL,
  profession_id VARCHAR(64) NOT NULL,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL
);

DO $$ BEGIN
  CREATE ROLE masterboy_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO masterboy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.cities,
  public.professions,
  public.users,
  public.user_sessions,
  public.otp_challenges,
  public.craftsmen,
  public.craftsman_photos,
  public.craftsman_drafts,
  public.craftsman_listings,
  public.top15_prices,
  public.top15_reservations,
  public.top15_memberships,
  public.payment_intents,
  public.support_messages,
  public.audit_logs,
  public.advertisements,
  public.ai_reports,
  public.listing_purge_logs
TO masterboy_app;

-- The application may update non-secret settings but cannot read or change
-- provider credential columns kept for legacy schema compatibility.
GRANT SELECT (id, config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;
GRANT INSERT (id, config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;
GRANT UPDATE (config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cities', 'professions', 'users', 'user_sessions', 'otp_challenges',
    'craftsmen', 'craftsman_photos', 'craftsman_drafts', 'craftsman_listings',
    'top15_prices', 'top15_reservations', 'top15_memberships', 'payment_intents',
    'support_messages', 'audit_logs', 'system_config', 'advertisements',
    'ai_reports', 'listing_purge_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS masterboy_server_access ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY masterboy_server_access ON public.%I FOR ALL TO masterboy_app USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END $$;
