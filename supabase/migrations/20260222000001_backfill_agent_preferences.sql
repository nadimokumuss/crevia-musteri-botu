-- Mevcut ajanlar için eksik agent_preferences kayıtlarını oluştur
-- Boş tercih = tüm ilçe/kategorilere açık (haftalık plan dağıtımına dahil olur)
INSERT INTO agent_preferences (agent_id, district_ids, categories)
SELECT id, '{}', '{}'
FROM agents
WHERE id NOT IN (SELECT agent_id FROM agent_preferences)
ON CONFLICT (agent_id) DO NOTHING;
