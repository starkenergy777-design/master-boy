-- Add deployment coordination only. No business rows, timers or prices change.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS masterboy_deploy;
REVOKE ALL ON SCHEMA masterboy_deploy FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA masterboy_deploy TO masterboy_app;

CREATE TABLE masterboy_deploy.writer_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  writer_token uuid,
  enforced boolean NOT NULL DEFAULT false,
  generation bigint NOT NULL DEFAULT 0,
  claimed_at timestamptz
);
INSERT INTO masterboy_deploy.writer_control(singleton) VALUES(true);
ALTER TABLE masterboy_deploy.writer_control ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON masterboy_deploy.writer_control TO masterboy_app;
CREATE POLICY backend_writer_control ON masterboy_deploy.writer_control
  FOR ALL TO masterboy_app USING (true) WITH CHECK (true);

CREATE FUNCTION masterboy_deploy.require_current_writer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE active_token uuid;
DECLARE fencing_enabled boolean;
BEGIN
  -- Administrative migration/backup roles remain usable. The application
  -- always uses masterboy_app, with no access for public browser roles.
  IF current_user <> 'masterboy_app' THEN RETURN NULL; END IF;
  SELECT writer_token,enforced INTO active_token,fencing_enabled
    FROM masterboy_deploy.writer_control WHERE singleton=true FOR SHARE;
  -- Installation alone must not disable the existing commercial application.
  -- First activation still requires the documented quiesced cutover because
  -- the old release acknowledges writes before it waits for their commit.
  IF NOT fencing_enabled THEN RETURN NULL; END IF;
  IF active_token IS NULL OR
     coalesce(current_setting('masterboy.writer_token',true),'') <> active_token::text THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DEPLOYMENT_WRITER_RETIRED';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION masterboy_deploy.require_current_writer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION masterboy_deploy.require_current_writer() TO masterboy_app;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','craftsmen','craftsman_photos','craftsman_drafts',
    'top15_prices','craftsman_listings','top15_reservations','top15_memberships',
    'payment_intents','advertisements','support_messages','ai_reports',
    'audit_logs','listing_purge_logs','financial_cases','system_config','server_secrets'
  ] LOOP
    EXECUTE format('CREATE TRIGGER deployment_writer_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION masterboy_deploy.require_current_writer()', table_name);
  END LOOP;
END;
$$;
COMMIT;
