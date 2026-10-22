ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_share_percent NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_admin_share_percent_range'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_admin_share_percent_range
      CHECK (admin_share_percent IS NULL OR admin_share_percent BETWEEN 0 AND 100);
  END IF;
END $$;

COMMENT ON COLUMN public.users.admin_share_percent IS
  'Administrator percentage share of company allocation; null means not assigned.';
