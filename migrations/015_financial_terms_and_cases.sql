-- Financial evidence and dispute cases for paid craftsman listings and Top 15.
-- Additive only: existing payment and user rows remain unchanged.
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS financial_terms_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS financial_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(16),
  ADD COLUMN IF NOT EXISTS service_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_ends_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.financial_cases (
  id VARCHAR(64) PRIMARY KEY,
  -- Keep evidence after a profile or payment record is retired.
  craftsman_id VARCHAR(64) NOT NULL,
  payment_intent_id VARCHAR(64) NOT NULL,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('NOT_ACTIVATED', 'DUPLICATE_CHARGE', 'EARLY_STOP', 'OTHER')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'AWAITING_PROVIDER', 'APPROVED', 'DECLINED', 'CLOSED')),
  decision_reason TEXT,
  requested_refund_minor INTEGER CHECK (requested_refund_minor >= 0),
  approved_refund_minor INTEGER CHECK (approved_refund_minor >= 0),
  provider_refund_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_cases_craftsman_created_idx ON public.financial_cases(craftsman_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_cases_status_created_idx ON public.financial_cases(status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.financial_cases TO masterboy_app;
ALTER TABLE public.financial_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS masterboy_server_access ON public.financial_cases;
CREATE POLICY masterboy_server_access ON public.financial_cases FOR ALL TO masterboy_app USING (true) WITH CHECK (true);
