'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { CategoryCount } from '@/types'

interface CategoryBreakdownChartProps {
  data: CategoryCount[]
}

export function CategoryBreakdownChart({ data }: CategoryBreakdownChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kategori Dağılımı</CardTitle>
          <CardDescription>Kategori bazlı lead sayısı ve ortalama puan</CardDescription>
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
        <CardTitle>Kategori Dağılımı</CardTitle>
        <CardDescription>Kategori bazlı lead sayısı ve ortalama puan</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => {
                const v = value ?? 0
                if (name === 'count') return [v, 'Lead Sayısı']
                if (name === 'avgScore') return [v, 'Ort. Puan']
                return [v, name ?? '']
              }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="count" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
