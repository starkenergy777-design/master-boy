-- UniPay merchant disclosure and durable one-time craftsman acceptance.
-- Additive only: no existing user, payment, or provider data is removed.
ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS merchant_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS merchant_contact_phone VARCHAR(32) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS merchant_contact_email VARCHAR(254) NOT NULL DEFAULT '';

ALTER TABLE public.craftsmen
  ADD COLUMN IF NOT EXISTS financial_terms_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS financial_terms_accepted_at TIMESTAMPTZ;

-- The runtime connects as this restricted role; browser roles receive no table grants.
GRANT SELECT (id, config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  merchant_address, merchant_contact_phone, merchant_contact_email,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;
GRANT INSERT (id, config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  merchant_address, merchant_contact_phone, merchant_contact_email,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;
GRANT UPDATE (config_locked, lock_expires_at, config_unlock_hash,
  recipient_bank_name, recipient_iban, recipient_tax_id, recipient_company_name,
  merchant_address, merchant_contact_phone, merchant_contact_email,
  standard_listing_price_minor, gemini_api_key_configured,
  bog_active, tbc_active, stripe_active, updated_at)
ON public.system_config TO masterboy_app;
