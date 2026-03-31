# Lead Scoring Skill

Need Score algoritmasını uygula veya güncelle.

## Dosyalar
- `src/core/scoring/need-score.ts` - Ana algoritma
- `src/types/scoring.ts` - Tip tanımları
- `tests/unit/scoring/need-score.test.ts` - Testler

## Kurallar
- Saf fonksiyon olmalı (I/O yok)
- Google alt puanı: 0-50, Instagram alt puanı: 0-50
- Toplam: 0-100
- Öneri eşleme: HIGH_PRIORITY (70-100), MEDIUM (45-69), LOW_PRIORITY (20-44), SKIP (0-19)
