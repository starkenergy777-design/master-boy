-- Add new trade categories while preserving existing professions and their ids.
INSERT INTO professions (id, name_ka, name_ru, name_en, icon, display_order, is_active)
VALUES
    ('prof-gas-water-heater', 'გაზის კალონკის ხელოსანი', 'Мастер по газовым колонкам', 'Gas water heater technician', 'Flame', 11, true),
    ('prof-sewer-cleaning', 'კანალიზაციის გაწმენდის სპეციალისტი', 'Специалист по прочистке канализации', 'Sewer cleaning specialist', 'Wrench', 12, true),
    ('prof-drywall', 'გიფსოკარდონის ხელოსანი', 'Мастер по гипсокартону', 'Drywall installer', 'Layers', 13, true),
    ('prof-stretch-ceiling', 'ფრანგული ჭერის ხელოსანი', 'Мастер по натяжным потолкам', 'Stretch ceiling installer', 'Layers', 14, true),
    ('prof-plasterer', 'მლესავი', 'Штукатур', 'Plasterer', 'Paintbrush', 15, true),
    ('prof-masonry', 'მშენებელი (ქვისა და ბლოკის წყობა)', 'Строитель (кладка камня и блока)', 'Builder (stone and block masonry)', 'Hammer', 16, true),
    ('prof-window-door', 'კარ-ფანჯრის ხელოსანი', 'Мастер по дверям и окнам', 'Door and window installer', 'Hammer', 17, true),
    ('prof-door-lock', 'კარისა და საკეტის ხელოსანი', 'Мастер по дверям и замкам', 'Door and lock specialist', 'Key', 18, true),
    ('prof-cctv-alarm', 'ვიდეოკამერებისა და სიგნალიზაციის ხელოსანი', 'Мастер по видеонаблюдению и сигнализации', 'CCTV and alarm technician', 'Zap', 19, true),
    ('prof-welder', 'ელექტროშემდუღებელი (სვარკა)', 'Электросварщик', 'Welder', 'Flame', 20, true)
ON CONFLICT (id) DO UPDATE SET
    name_ka = EXCLUDED.name_ka,
    name_ru = EXCLUDED.name_ru,
    name_en = EXCLUDED.name_en,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order,
    is_active = true;

-- Create the usual 50 GEL Top 15 price for every existing city and new profession.
-- Existing prices are kept so a configured price is never overwritten.
INSERT INTO top15_prices (id, city_id, profession_id, amount_minor, currency, updated_at)
SELECT
    c.id || ':' || p.id AS id,
    c.id,
    p.id,
    5000,
    'GEL',
    NOW()
FROM cities AS c
CROSS JOIN professions AS p
WHERE p.id IN ('prof-gas-water-heater', 'prof-sewer-cleaning', 'prof-drywall', 'prof-stretch-ceiling', 'prof-plasterer', 'prof-masonry', 'prof-window-door', 'prof-door-lock', 'prof-cctv-alarm', 'prof-welder')
ON CONFLICT (id) DO NOTHING;
