-- Remove soft-deleted craftsmen and release their paid Top 15 placements.
-- Keep payment ledger rows, but detach them from deleted profile identities.
BEGIN;

ALTER TABLE public.payment_intents
  ALTER COLUMN craftsman_id DROP NOT NULL;

ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_craftsman_id_fkey;

ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_craftsman_id_fkey
  FOREIGN KEY (craftsman_id) REFERENCES public.craftsmen(id) ON DELETE SET NULL;

DO $$
DECLARE
  deleted_craftsman_ids text[];
  deleted_user_ids text[];
BEGIN
  SELECT array_agg(id::text), array_agg(user_id::text)
  INTO deleted_craftsman_ids, deleted_user_ids
  FROM public.craftsmen
  WHERE status = 'DELETED';

  IF deleted_craftsman_ids IS NOT NULL THEN
    DELETE FROM public.ai_reports
    WHERE craftsman_id::text = ANY(deleted_craftsman_ids);

    DELETE FROM public.craftsmen
    WHERE id::text = ANY(deleted_craftsman_ids);

    DELETE FROM public.users
    WHERE id::text = ANY(deleted_user_ids)
      AND status = 'DELETED';
  END IF;
END $$;

COMMIT;
