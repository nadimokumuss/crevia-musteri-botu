'use client'

import { Button } from '@/components/ui/button'
import type { CallListItem } from '@/types/call'

interface CallExportButtonsProps {
  items: CallListItem[]
  listDate?: string
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

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Bekliyor',
  COMPLETED: 'Tamamlandi',
  NO_ANSWER: 'Cevap Yok',
  CALLBACK: 'Geri Aranacak',
  INTERESTED: 'Ilgili',
  NOT_INTERESTED: 'Ilgili Degil',
  WRONG_NUMBER: 'Yanlis Numara',
  DEMO: 'Deneme Cekimi',
}

export function CallExportButtons({ items, listDate, agentName }: CallExportButtonsProps) {
  async function exportExcel() {
    const XLSX = await import('xlsx')

    const data = items.map((item) => ({
      'Sıra': item.order,
      'İşletme Adı': item.businessName,
      'Telefon': item.phone ?? '-',
      'Puan': item.needScore,
      'Durum': STATUS_LABELS[item.status] ?? item.status,
      'Sonuç': item.outcome ?? '',
      'Not': item.notes ?? '',
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    ws['!cols'] = [
      { wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Arama Listesi')
    XLSX.writeFile(wb, `arama_${listDate ?? 'tum'}_${agentName ?? 'export'}.xlsx`)
  }

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text(transliterate(`Arama Listesi - ${listDate ?? 'Tum'}`), 14, 22)

    if (agentName) {
      doc.setFontSize(11)
      doc.text(transliterate(`Ajan: ${agentName}`), 14, 30)
    }

    autoTable(doc, {
      startY: agentName ? 35 : 30,
      head: [['Sira', 'Isletme', 'Telefon', 'Puan', 'Durum', 'Not']],
      body: items.map((item) => [
        item.order,
        transliterate(item.businessName),
        item.phone ?? '-',
        item.needScore,
        STATUS_LABELS[item.status] ?? item.status,
        transliterate(item.notes ?? ''),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    })

    doc.save(`arama_${listDate ?? 'tum'}_${agentName ?? 'export'}.pdf`)
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
