# Deploy Production Skill

Vercel + Supabase Cloud dağıtımı.

## Adımlar
1. `npm run typecheck` - Sıfır hata
2. `npm run build` - Başarılı derleme
3. `npm run test` - Tüm testler geçmeli
4. Vercel dağıtımı
5. Supabase migration uygula

## Kurallar
- Env variable'lar Vercel dashboard'dan ayarla
- SUPABASE_SERVICE_ROLE_KEY asla client-side'da olmamalı
- Build öncesi typecheck zorunlu
