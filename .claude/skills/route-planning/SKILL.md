# Route Planning Skill

Rota optimizasyonu ve arama listesi oluşturma.

## Dosyalar
- `src/core/routing/geo-cluster.ts` - DBSCAN kümeleme
- `src/core/routing/route-optimizer.ts` - TSP çözücü
- `src/core/routing/call-list-generator.ts` - Arama listesi
- `src/core/scheduler/weekly-planner.ts` - Haftalık planlayıcı
- `src/infra/maps/map-provider.interface.ts` - Harita arayüzü

## Kurallar
- DBSCAN: epsilon=500m, minPoints=3
- TSP: Nearest Neighbor + 2-opt
- Mesafe: Haversine * 1.3 düzeltme faktörü
- 8-15 durak için 50ms altında çalışmalı
