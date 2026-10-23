-- Remove redundant indexes without changing application data or table schemas.
-- users_phone_key is a unique btree index on the same column as idx_users_phone.
DROP INDEX IF EXISTS public.idx_users_phone;

-- The map search feature was removed; no runtime query filters by coordinates.
-- Keep the coordinate columns for compatibility, but remove the unused index.
DROP INDEX IF EXISTS public.idx_craftsmen_lat_lng;
