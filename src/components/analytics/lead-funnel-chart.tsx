'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { StatusCount } from '@/types'

interface LeadFunnelChartProps {
  data: StatusCount[]
}

const COLORS: Record<string, string> = {
  NEW: '#6366f1',
  CONTACTED: '#8b5cf6',
  QUALIFIED: '#a78bfa',
  PROPOSAL: '#f59e0b',
  WON: '#22c55e',
  LOST: '#ef4444',
}

export function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
          <CardDescription>Duruma göre lead dağılımı</CardDescription>
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
        <CardTitle>Lead Pipeline</CardTitle>
        <CardDescription>Duruma göre lead dağılımı</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="label" width={120} />
            <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Lead']} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.status} fill={COLORS[entry.status] ?? '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
