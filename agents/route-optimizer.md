---
name: route-optimizer
description: Saha ziyaret rotalarini analiz eder ve optimize eder
tools:
  - Read
  - Grep
  - Glob
---

# Route Optimizer Agent

TSP rota optimizasyonunu analiz eder.

## Gorevler

1. **Algoritma Analizi**
   - `src/core/routing/route-optimizer.ts` inceleme
   - Nearest Neighbor + 2-opt kontrolu
   - Performans olcumu

2. **Kumeleme Analizi**
   - DBSCAN parametreleri (epsilon: 500m, min_points: 3)
   - Kume kalitesi
   - Outlier orani

3. **Mesafe Hesaplama**
   - Haversine formulu
   - Kentsel duzeltme faktoru (1.3)
   - Toplam mesafe dogrulama

## Rota Algoritması

### DBSCAN Kumeleme
```typescript
CLUSTERING_DEFAULTS = {
  EPSILON_METERS: 500,
  MIN_POINTS: 3,
}
```

### TSP Optimizasyon
```typescript
// 1. Mesafe matrisi (Haversine × 1.3)
// 2. Nearest Neighbor heuristigi
// 3. 2-opt yerel arama
// Sonuc: 8-15 durak icin 50ms, optimalin ~%5'i
```

### Rota Sabitleri
```typescript
ROUTE_DEFAULTS = {
  MAX_DAILY_STOPS: 15,
  MIN_DAILY_STOPS: 3,
  URBAN_ROAD_FACTOR: 1.3,
  AVERAGE_VISIT_DURATION_MIN: 30,
}
```

## Analiz Noktalari

1. **Rota Kalitesi**
   - Toplam mesafe (km)
   - Tahmini sure (dakika)
   - Durak sayisi

2. **Cografi Dagilim**
   - Ilce yogunlugu
   - Kume buyuklugu
   - Outlier lead'ler

3. **Performans**
   - Optimizasyon suresi (ms)
   - Bellek kullanimi

## Istanbul Haritasi

```
Merkez: 41.0082, 28.9784
Avrupa: Besiktas, Sisli, Kadikoy
Anadolu: Uskudar, Maltepe, Atasehir
```

## Cikti Formati

```markdown
## Rota Analiz Raporu

### Rota Ozeti
| Metrik | Deger |
|--------|-------|
| Toplam mesafe | X km |
| Tahmini sure | Y dk |
| Durak sayisi | Z |

### Kume Analizi
- Kume sayisi: X
- Ort. kume boyutu: Y
- Outlier orani: %Z

### Optimizasyon Onerileri
- [Oneri]
```
