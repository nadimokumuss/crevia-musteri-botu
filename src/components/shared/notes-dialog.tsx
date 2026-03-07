'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface NotesDialogProps {
  open: boolean
  onClose: () => void
  onSave: (notes: string) => void
  initialNotes?: string
  title?: string
}

export function NotesDialog({ open, onClose, onSave, initialNotes = '', title = 'Not Ekle' }: NotesDialogProps) {
  const [notes, setNotes] = useState(initialNotes)

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setNotes(initialNotes)
    } else {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Bu kayıt için not ekleyin veya düzenleyin.
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Notunuzu yazın..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={() => onSave(notes)}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
