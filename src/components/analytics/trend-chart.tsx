'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { TrendDataPoint } from '@/types'

interface TrendChartProps {
  data: TrendDataPoint[]
}

function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${day}/${month}`
}

export function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0 || data.every((d) => d.newLeads === 0 && d.wonLeads === 0 && d.completedVisits === 0 && d.completedCalls === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Haftalık Trend</CardTitle>
          <CardDescription>Son 12 haftalık aktivite trendi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Henüz veri yok
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatWeekLabel(d.date),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Haftalık Trend</CardTitle>
        <CardDescription>Son 12 haftalık aktivite trendi</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="newLeads" name="Yeni Lead" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
            <Area type="monotone" dataKey="wonLeads" name="Kazanılan" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
            <Area type="monotone" dataKey="completedVisits" name="Ziyaret" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
            <Area type="monotone" dataKey="completedCalls" name="Arama" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
