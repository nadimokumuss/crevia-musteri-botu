'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { AgentPerformance } from '@/types'

interface AgentPerformanceChartProps {
  data: AgentPerformance[]
}

export function AgentPerformanceChart({ data }: AgentPerformanceChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ajan Performansı</CardTitle>
          <CardDescription>Ajan bazlı ziyaret, arama ve tamamlama oranı</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Henüz veri yok
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((agent) => ({
    name: agent.agentName,
    Ziyaret: agent.totalVisits,
    Arama: agent.totalCalls,
    'Tamamlama %': agent.completionRate,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajan Performansı</CardTitle>
        <CardDescription>Ajan bazlı ziyaret, arama ve tamamlama oranı</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Ziyaret" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Arama" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Tamamlama %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
