'use client'

import { Button } from '@/components/ui/button'
import type { RouteStop } from '@/types/database'

interface RouteExportButtonsProps {
  stops: RouteStop[]
  routeDate: string
  agentName?: string
}

/** jsPDF varsayilan fontu (Helvetica) Turkce karakterleri desteklemez. PDF icin transliterasyon uygula. */
function transliterate(text: string): string {
  return text
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
}

export function RouteExportButtons({ stops, routeDate, agentName }: RouteExportButtonsProps) {
  async function exportExcel() {
    const XLSX = await import('xlsx')

    const data = stops.map((stop) => ({
      'Sıra': stop.order,
      'İşletme Adı': stop.business_name ?? '-',
      'Telefon': stop.phone ?? '-',
      'Durum': stop.status,
      'Not': stop.notes ?? '',
      'Sonuç': stop.outcome ?? '',
      'Enlem': stop.lat,
      'Boylam': stop.lng,
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    // Kolon genişlikleri
    ws['!cols'] = [
      { wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Rota')
    XLSX.writeFile(wb, `rota_${routeDate}_${agentName ?? 'export'}.xlsx`)
  }

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text(transliterate(`Rota - ${routeDate}`), 14, 22)

    if (agentName) {
      doc.setFontSize(11)
      doc.text(transliterate(`Ajan: ${agentName}`), 14, 30)
    }

    autoTable(doc, {
      startY: agentName ? 35 : 30,
      head: [['Sira', 'Isletme', 'Telefon', 'Durum', 'Not']],
      body: stops.map((stop) => [
        stop.order,
        transliterate(stop.business_name ?? '-'),
        stop.phone ?? '-',
        transliterate(stop.status),
        transliterate(stop.notes ?? ''),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    })

    doc.save(`rota_${routeDate}_${agentName ?? 'export'}.pdf`)
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={exportExcel}>
        Excel İndir
      </Button>
      <Button variant="outline" size="sm" onClick={exportPdf}>
        PDF İndir
      </Button>
    </div>
  )
}
