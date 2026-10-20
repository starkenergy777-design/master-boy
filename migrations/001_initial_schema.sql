-- ============================================================================
-- MASTER_BOY Database Migration 001: Initial Schema
-- PostgreSQL 14+ / Supabase / Neon / Cloud SQL compatible
-- Architecture: Multi-role, Georgian localized, geospatial indexed, billing & Top-15
-- ============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ENUMS & DOMAINS
-- ----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('CLIENT', 'CRAFTSMAN', 'ADMIN', 'SUPER_ADMIN', 'AD_PARTNER');
EXCEPTION
    WHEN duplicate_object THEN
        BEGIN
            ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'AD_PARTNER';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE craftsman_status AS ENUM (
        'UNPAID_DRAFT',
        'ACTIVE',
        'EXPIRED',
        'PURGED',
        'BLOCKED',
        'DELETED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reservation_status AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE membership_status AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_provider AS ENUM ('BOG', 'TBC', 'STRIPE', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE chat_sender_type AS ENUM ('CRAFTSMAN', 'AI_ADMIN', 'HUMAN_ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CITIES & REGIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
    id VARCHAR(64) PRIMARY KEY,
    name_ka VARCHAR(120) NOT NULL,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active);

-- ----------------------------------------------------------------------------
-- 3. PROFESSIONS / CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS professions (
    id VARCHAR(64) PRIMARY KEY,
    name_ka VARCHAR(120) NOT NULL,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    icon VARCHAR(64) NOT NULL DEFAULT 'Wrench',
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professions_active ON professions(is_active);

-- ----------------------------------------------------------------------------
-- 4. USERS TABLE (Authentication & Roles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    roles user_role[] NOT NULL DEFAULT ARRAY['CLIENT']::user_role[],
    status user_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ----------------------------------------------------------------------------
-- 5. SESSIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ----------------------------------------------------------------------------
-- 6. OTP CHALLENGES (SMS Verification)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_challenges (
    challenge_id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_challenges(phone);

-- ----------------------------------------------------------------------------
-- 7. CRAFTSMEN PROFILES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS craftsmen (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    phone VARCHAR(32) NOT NULL,
    phone_visible BOOLEAN NOT NULL DEFAULT true,
    city_id VARCHAR(64) NOT NULL REFERENCES cities(id),
    profession_id VARCHAR(64) NOT NULL REFERENCES professions(id),
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    working_hours JSONB DEFAULT '{
        "monday": "09:00-18:00",
        "tuesday": "09:00-18:00",
        "wednesday": "09:00-18:00",
        "thursday": "09:00-18:00",
        "friday": "09:00-18:00",
        "saturday": "10:00-15:00",
        "sunday": null
    }'::jsonb,
    status craftsman_status NOT NULL DEFAULT 'UNPAID_DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_craftsmen_city_prof ON craftsmen(city_id, profession_id);
CREATE INDEX IF NOT EXISTS idx_craftsmen_status ON craftsmen(status);
CREATE INDEX IF NOT EXISTS idx_craftsmen_lat_lng ON craftsmen(latitude, longitude);

-- ----------------------------------------------------------------------------
-- 8. CRAFTSMAN PHOTOS (Max 1 primary photo per craftsman)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS craftsman_photos (
    id VARCHAR(64) PRIMARY KEY,
    craftsman_id VARCHAR(64) NOT NULL REFERENCES craftsmen(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_craftsman_photos_cid ON craftsman_photos(craftsman_id);

-- ----------------------------------------------------------------------------
-- 9. CRAFTSMAN DRAFTS (Multi-step wizard cache)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS craftsman_drafts (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    step INT NOT NULL DEFAULT 1,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. CRAFTSMAN LISTINGS (180-Day standard subscription + 30-Day grace)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS craftsman_listings (
    id VARCHAR(64) PRIMARY KEY,
    craftsman_id VARCHAR(64) NOT NULL UNIQUE REFERENCES craftsmen(id) ON DELETE CASCADE,
    city_id VARCHAR(64) NOT NULL REFERENCES cities(id),
    profession_id VARCHAR(64) NOT NULL REFERENCES professions(id),
    status craftsman_status NOT NULL DEFAULT 'UNPAID_DRAFT',
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ,
    last_payment_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_expiry ON craftsman_listings(expires_at, grace_ends_at);
CREATE INDEX IF NOT EXISTS idx_listings_status ON craftsman_listings(status);

-- ----------------------------------------------------------------------------
-- 11. TOP 15 PRICES TABLE (Per City & Profession configuration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS top15_prices (
    id VARCHAR(128) PRIMARY KEY, -- format: "city_id:profession_id"
    city_id VARCHAR(64) NOT NULL REFERENCES cities(id),
    profession_id VARCHAR(64) NOT NULL REFERENCES professions(id),
    amount_minor INT NOT NULL, -- e.g. 5000 = 50.00 GEL
    currency VARCHAR(8) NOT NULL DEFAULT 'GEL',
    updated_by VARCHAR(64) REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_top15_price_city_prof ON top15_prices(city_id, profession_id);

-- ----------------------------------------------------------------------------
-- 12. TOP 15 RESERVATIONS (3-Minute Slot Hold)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS top15_reservations (
    id VARCHAR(64) PRIMARY KEY,
    city_id VARCHAR(64) NOT NULL REFERENCES cities(id),
    profession_id VARCHAR(64) NOT NULL REFERENCES professions(id),
    craftsman_id VARCHAR(64) NOT NULL REFERENCES craftsmen(id) ON DELETE CASCADE,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL, -- 3