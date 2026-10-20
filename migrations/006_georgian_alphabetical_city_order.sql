-- Correct the non-major city order to Georgian alphabetical order.
-- The first four entries remain the major centers requested by the product owner.
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
WHERE c.id = v.id
  AND c.display_order IS DISTINCT FROM v.display_order;

COMMIT;
