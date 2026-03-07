-- Aynı lead'in birden fazla kez atanmasını engelle
-- Mevcut constraint: (lead_id, scheduled_date, assignment_type) - farklı tarihlere atamaya izin veriyor
-- Yeni constraint: lead_id - bir lead sadece bir kez atanabilir

-- Önce mevcut duplike atamaları temizle (en eski olanı tut)
DELETE FROM assignments a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (lead_id) id
  FROM assignments
  ORDER BY lead_id, created_at ASC
);

-- Eski constraint'i kaldır
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS unique_lead_date_type;

-- Yeni constraint: Her lead sadece bir kez atanabilir
ALTER TABLE assignments ADD CONSTRAINT unique_lead_single_assignment UNIQUE (lead_id);

-- Performans için index
CREATE INDEX IF NOT EXISTS idx_assignments_lead_unique ON assignments(lead_id);
