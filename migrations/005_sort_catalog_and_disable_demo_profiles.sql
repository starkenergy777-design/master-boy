-- Keep the requested city ordering and prevent sample accounts from appearing
-- as paid, public listings. Rows are retained so an administrator can review
-- or restore them without data loss.
BEGIN;

UPDATE public.cities AS c
SET display_order = v.display_order
FROM (VALUES
  ('city-tbilisi', 1),
  ('city-batumi', 2),
  ('city-kutaisi', 3),
  ('city-rustavi', 4),
  ('city-akhaltsikhe', 5),
  ('city-borjomi', 6),
  ('city-gori', 7),
  ('city-zestafoni', 8),
  ('city-zugdidi', 9),
  ('city-telavi', 10),
  ('city-martvili', 11),
  ('city-samtredia', 12),
  ('city-svaneti', 13),
  ('city-poti', 14),
  ('city-kobuleti', 15),
  ('city-tskaltubo', 16),
  ('city-khashuri', 17)
) AS v(id, display_order)
WHERE c.id = v.id;

UPDATE public.users
SET status = 'BLOCKED', updated_at = NOW()
WHERE id IN ('usr-cm-1','usr-cm-2','usr-cm-3','usr-cm-4','usr-cm-5')
  AND 'CRAFTSMAN' = ANY(roles)
  AND status = 'ACTIVE';

UPDATE public.craftsmen
SET status = 'BLOCKED', updated_at = NOW()
WHERE id IN ('cm-1','cm-2','cm-3','cm-4','cm-5')
  AND status = 'ACTIVE';

UPDATE public.craftsman_listings
SET status = 'EXPIRED', updated_at = NOW()
WHERE craftsman_id IN ('cm-1','cm-2','cm-3','cm-4','cm-5')
  AND status = 'ACTIVE';

UPDATE public.top15_memberships
SET status = 'REVOKED'
WHERE craftsman_id IN ('cm-1','cm-2','cm-3','cm-4','cm-5')
  AND status = 'ACTIVE';

DELETE FROM public.user_sessions
WHERE user_id IN ('usr-cm-1','usr-cm-2','usr-cm-3','usr-cm-4','usr-cm-5');

COMMIT;
