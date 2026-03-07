-- Istanbul ilçeleri (aktif satış bölgeleri)
INSERT INTO districts (name, lat, lng, is_active) VALUES
    ('Kadıköy', 40.9927, 29.0287, true),
    ('Beşiktaş', 41.0422, 29.0053, true),
    ('Şişli', 41.0602, 28.9877, true),
    ('Bakırköy', 40.9819, 28.8774, true),
    ('Ataşehir', 40.9923, 29.1244, true),
    ('Üsküdar', 41.0234, 29.0154, true),
    ('Beyoğlu', 41.0370, 28.9770, true),
    ('Sarıyer', 41.1667, 29.0500, true),
    ('Maltepe', 40.9333, 29.1333, true),
    ('Kartal', 40.8895, 29.1871, true),
    ('Levent', 41.0814, 29.0134, true),
    ('Maslak', 41.1089, 29.0201, true),
    ('Mecidiyeköy', 41.0669, 28.9939, true),
    ('Etiler', 41.0833, 29.0333, true),
    ('Nişantaşı', 41.0500, 28.9900, true)
ON CONFLICT (name) DO NOTHING;
