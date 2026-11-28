BEGIN;

CREATE TABLE public.top15_offers (
  id varchar(64) PRIMARY KEY,
  city_id varchar(64) REFERENCES public.cities(id),
  profession_id varchar(64) REFERENCES public.professions(id),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency varchar(3) NOT NULL DEFAULT 'GEL' CHECK (currency = 'GEL'),
  activation_limit integer NOT NULL CHECK (activation_limit > 0),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 120),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= activation_limit),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','COMPLETED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(64) NOT NULL,
  updated_by varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX top15_one_active_offer ON public.top15_offers ((true)) WHERE status='ACTIVE';

-- No user/profile FK: deleting an account must never reset campaign usage/history.
CREATE TABLE public.top15_offer_uses (
  id varchar(64) PRIMARY KEY,
  offer_id varchar(64) NOT NULL REFERENCES public.top15_offers(id),
  user_id varchar(64) NOT NULL,
  craftsman_id varchar(64) NOT NULL,
  reservation_id varchar(64),
  membership_id varchar(64),
  status text NOT NULL CHECK (status IN ('HELD','ACTIVATED','CANCELLED')),
  snapshot jsonb NOT NULL,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id,user_id)
);
CREATE INDEX top15_offer_uses_reservation ON public.top15_offer_uses(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX top15_offer_pending_uses ON public.top15_offer_uses(offer_id) WHERE status='HELD';
ALTER TABLE public.top15_reservations ADD COLUMN special_offer jsonb;
ALTER TABLE public.top15_memberships ADD COLUMN special_offer jsonb;

ALTER TABLE public.top15_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top15_offer_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.top15_offers,public.top15_offer_uses FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.top15_offers,public.top15_offer_uses TO masterboy_app;
CREATE POLICY top15_offers_backend ON public.top15_offers TO masterboy_app USING (true) WITH CHECK (true);
CREATE POLICY top15_offer_uses_backend ON public.top15_offer_uses TO masterboy_app USING (true) WITH CHECK (true);
CREATE TRIGGER deployment_writer_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.top15_offers FOR EACH STATEMENT EXECUTE FUNCTION masterboy_deploy.require_current_writer();
CREATE TRIGGER deployment_writer_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.top15_offer_uses FOR EACH STATEMENT EXECUTE FUNCTION masterboy_deploy.require_current_writer();

COMMIT;
