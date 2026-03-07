'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface CategoryCounts {
  high_priority: number
  new_recent: number
  contacted: number
  visited: number
  proposal: number
  callback: number
  total: number
}

interface LeadCategoryCardsProps {
  onCategorySelect: (view: string) => void
  activeView: string | null
}

const CATEGORIES = [
  {
    key: 'high_priority',
    label: 'Potansiyeli Yüksek',
    description: 'Yüksek öncelikli yeni işletmeler',
    color: 'border-red-200 bg-red-50 hover:bg-red-100',
    activeColor: 'border-red-500 bg-red-100 ring-2 ring-red-300',
  },
  {
    key: 'new_recent',
    label: 'Yeni Eklenen',
    description: 'Son 7 gün içinde eklenen',
    color: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    activeColor: 'border-blue-500 bg-blue-100 ring-2 ring-blue-300',
  },
  {
    key: 'contacted',
    label: 'Aranan İşletmeler',
    description: 'İletişim kurulmuş',
    color: 'border-cyan-200 bg-cyan-50 hover:bg-cyan-100',
    activeColor: 'border-cyan-500 bg-cyan-100 ring-2 ring-cyan-300',
  },
  {
    key: 'visited',
    label: 'Ziyaret Edilen',
    description: 'Saha ziyareti tamamlanan',
    color: 'border-green-200 bg-green-50 hover:bg-green-100',
    activeColor: 'border-green-500 bg-green-100 ring-2 ring-green-300',
  },
  {
    key: 'proposal',
    label: 'Teklif Bırakılan',
    description: 'Teklif aşamasında',
    color: 'border-purple-200 bg-purple-50 hover:bg-purple-100',
    activeColor: 'border-purple-500 bg-purple-100 ring-2 ring-purple-300',
  },
  {
    key: 'callback',
    label: 'Geri Aranacak',
    description: 'Geri arama bekleyen',
    color: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100',
    activeColor: 'border-yellow-500 bg-yellow-100 ring-2 ring-yellow-300',
  },
]

export function LeadCategoryCards({ onCategorySelect, activeView }: LeadCategoryCardsProps) {
  const [counts, setCounts] = useState<CategoryCounts | null>(null)

  useEffect(() => {
    fetch('/api/leads/categories')
      .then((res) => res.json())
      .then((data) => setCounts(data))
      .catch(() => {})
  }, [])

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      {CATEGORIES.map((cat) => {
        const count = counts ? (counts[cat.key as keyof CategoryCounts] ?? 0) : '...'
        const isActive = activeView === cat.key

        return (
          <Card
            key={cat.key}
            className={`cursor-pointer border-2 transition-all ${isActive ? cat.activeColor : cat.color}`}
            onClick={() => onCategorySelect(isActive ? '' : cat.key)}
          >
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-sm font-medium">{cat.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{cat.description}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
