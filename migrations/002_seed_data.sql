-- ============================================================================
-- MASTER_BOY Database Migration 002: Seed Data
-- Populates the 17-city and 10-profession catalogs and initial Top 15 pricing.
-- Production administrator accounts are bootstrapped from Render secrets.
-- Never seed public demo craftsmen or reusable credentials into production.
-- ============================================================================

-- 1. Cities in Georgia
INSERT INTO cities (id, name_ka, name_ru, name_en, lat, lng, is_active, display_order)
VALUES
    ('city-tbilisi', 'თბილისი', 'Тбилиси', 'Tbilisi', 41.7151, 44.8271, true, 1),
    ('city-batumi', 'ბათუმი', 'Батуми', 'Batumi', 41.6168, 41.6367, true, 2),
    ('city-kutaisi', 'ქუთაისი', 'Кутаиси', 'Kutaisi', 42.2662, 42.7180, true, 3),
    ('city-rustavi', 'რუსთავი', 'Рустави', 'Rustavi', 41.5495, 44.9932, true, 4),
    ('city-akhaltsikhe', 'ახალციხე', 'Ахалцихе', 'Akhaltsikhe', 41.643429, 42.993445, true, 5),
    ('city-borjomi', 'ბორჯომი', 'Боржоми', 'Borjomi', 41.839953, 43.390757, true, 6),
    ('city-gori', 'გორი', 'Гори', 'Gori', 41.9842, 44.1158, true, 7),
    ('city-zestafoni', 'ზესტაფონი', 'Зестафони', 'Zestafoni', 42.108333, 43.037493, true, 8),
    ('city-zugdidi', 'ზუგდიდი', 'Зугдиди', 'Zugdidi', 42.5088, 41.8709, true, 9),
    ('city-telavi', 'თელავი', 'Телави', 'Telavi', 41.9198, 45.4731, true, 10),
    ('city-martvili', 'მარტვილი', 'Мартвили', 'Martvili', 42.423184, 42.381115, true, 11),
    ('city-samtredia', 'სამტრედია', 'Самтредиа', 'Samtredia', 42.159926, 42.336768, true, 12),
    ('city-svaneti', 'სვანეთი', 'Сванетия', 'Svaneti', 43.0438, 42.723680, true, 13),
    ('city-poti', 'ფოთი', 'Поти', 'Poti', 42.1462, 41.6720, true, 14),
    ('city-kobuleti', 'ქობულეთი', 'Кобулети', 'Kobuleti', 41.815997, 41.783810, true, 15),
    ('city-tskaltubo', 'წყალტუბო', 'Цхалтубо', 'Tskaltubo', 42.328499, 42.600368, true, 16),
    ('city-khashuri', 'ხაშური', 'Хашури', 'Khashuri', 41.983769, 43.586595, true, 17)
ON CONFLICT (id) DO NOTHING;

-- 2. Professional Categories
INSERT INTO professions (id, name_ka, name_ru, name_en, icon, display_order, is_active)
VALUES
    ('prof-plumber', 'სანტექნიკოსი', 'Сантехник', 'Plumber', 'Wrench', 1, true),
    ('prof-electrician', 'ელექტრიკოსი', 'Электрик', 'Electrician', 'Zap', 2, true),
    ('prof-ac', 'კონდიციონერის ხელოსანი', 'Мастер кондиционеров', 'HVAC / AC Master', 'Wind', 3, true),
    ('prof-carpenter', 'ავეჯის ხელოსანი / დურგალი', 'Мебельщик / Плотник', 'Furniture / Carpenter', 'Hammer', 4, true),
    ('prof-painter', 'მღებავი / სამღებრო', 'Маляр', 'Painter', 'Paintbrush', 5, true),
    ('prof-tiler', 'მეკაფელე', 'Плиточник', 'Tiler', 'Layers', 6, true),
    ('prof-locksmith', 'საკეტების ხელოსანი', 'Замочный мастер', 'Locksmith', 'Key', 7, true),
    ('prof-heating', 'გათბობის ხელოსანი', 'Мастер по отоплению', 'Heating Specialist', 'Flame', 8, true),
    ('prof-demolition-drill', 'პერფერატორით დანგრევა', 'Демонтаж перфоратором', 'Demolition with a hammer drill', 'Hammer', 9, true),
    ('prof-waste-removal', 'ნაგვის გატანა', 'Вывоз мусора', 'Waste removal', 'Truck', 10, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Initial Top 15 Prices (50.00 GEL for all categories)
INSERT INTO top15_prices (id, city_id, profession_id, amount_minor, currency, updated_at)
SELECT
    c.id || ':' || p.id AS id,
    c.id AS city_id,
    p.id AS profession_id,
    5000 AS amount_minor,
    'GEL' AS currency,
    NOW() AS updated_at
FROM cities c
CROSS JOIN professions p
ON CONFLICT (id) DO NOTHING;

-- 4. Seed System Config
INSERT INTO system_config (
    id,
    config_locked,
    recipient_bank_name,
    recipient_iban,
    recipient_tax_id,
    recipient_company_name,
    standard_listing_price_minor
) VALUES (
    'global_config',
    false,
    'TBC Bank JSC',
    '',
    '',
    'MASTER_BOY LLC',
    5000
) ON CONFLICT (id) DO NOTHING;
