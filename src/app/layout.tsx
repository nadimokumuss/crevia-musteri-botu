import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Crevia Sales OS',
  description: 'Istanbul merkezli kreatif ajans Crevia icin B2B satis platformu',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
