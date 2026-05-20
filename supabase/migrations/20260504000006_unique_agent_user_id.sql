-- agents.user_id UNIQUE constraint
--
-- ⚠️ PRE-FLIGHT KONTROL — bu migration'ı çalıştırmadan ÖNCE şu sorguyu Supabase'de çalıştırın:
--
--   SELECT user_id, count(*)
--   FROM agents
--   WHERE user_id IS NOT NULL
--   GROUP BY user_id
--   HAVING count(*) > 1;
--
-- Eğer satır dönerse, duplicate'leri manuel temizleyin:
--   1. Hangi agent kaydının "doğru" olduğuna karar verin (en aktif veya en son güncellenen)
--   2. Diğerlerini sil veya user_id'sini NULL'a çekin
-- Sonra bu migration'ı uygulayın.
--
-- Eğer pre-flight 0 satır dönüyorsa migration güvenle uygulanır.

DO $$
DECLARE
  v_dupe_count INT;
BEGIN
  SELECT count(*) INTO v_dupe_count
  FROM (
    SELECT user_id
    FROM agents
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
  ) sub;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'agents.user_id duplicate (% adet) — pre-flight temizliği gerekli', v_dupe_count;
  END IF;
END $$;

ALTER TABLE agents
  ADD CONSTRAINT agents_user_id_unique UNIQUE (user_id);
