-- ============================================================================
-- MASTER_BOY Database Migration 003: Advertisements Schema
-- Advertisements table with strict commercial policies and company legal identity
-- ============================================================================

CREATE TABLE IF NOT EXISTS advertisements (
    id VARCHAR(64) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    phone_number VARCHAR(32) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- application stores an scrypt password hash, never plaintext
    expires_at TIMESTAMPTZ NOT NULL,
    image_url TEXT,
    target_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    payment_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending')),
    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    days_duration INTEGER NOT NULL DEFAULT 30,
    price_gel NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if table was already created
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS days_duration INTEGER NOT NULL DEFAULT 30;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS price_gel NUMERIC(10, 2) NOT NULL DEFAULT 50.00;

CREATE INDEX IF NOT EXISTS idx_ads_active_status_expiry 
ON advertisements(is_active, payment_status, expires_at);

CREATE INDEX IF NOT EXISTS idx_ads_phone 
ON advertisements(phone_number);
