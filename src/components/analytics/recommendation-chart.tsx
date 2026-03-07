'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { RecommendationCount } from '@/types'

interface RecommendationChartProps {
  data: RecommendationCount[]
}

const COLORS: Record<string, string> = {
  HIGH_PRIORITY: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW_PRIORITY: '#3b82f6',
  SKIP: '#94a3b8',
}

export function RecommendationChart({ data }: RecommendationChartProps) {
  const filtered = data.filter((d) => d.count > 0)

  if (filtered.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Öneri Dağılımı</CardTitle>
          <CardDescription>Lead öncelik seviyeleri</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Henüz veri yok
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Öneri Dağılımı</CardTitle>
        <CardDescription>Lead öncelik seviyeleri</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={filtered}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="count"
              nameKey="label"
              paddingAngle={2}
            >
              {filtered.map((entry) => (
                <Cell key={entry.recommendation} fill={COLORS[entry.recommendation] ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Lead']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
