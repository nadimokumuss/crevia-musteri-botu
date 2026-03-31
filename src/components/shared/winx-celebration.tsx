'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { WINX_FAIRIES } from '@/lib/constants'

interface WinxCelebrationProps {
  fairyId: string
  statusLabel: string
  onComplete: () => void
}

export function WinxCelebration({ fairyId, statusLabel, onComplete }: WinxCelebrationProps) {
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter')
  const fairy = WINX_FAIRIES.find((f) => f.id === fairyId)

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase('exit'), 2000)
    const doneTimer = setTimeout(onComplete, 2500)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(doneTimer)
    }
  }, [onComplete])

  // Sparkle pozisyonlarını ilk render'da sabitle (Math.random render sırasında çağrılamaz)
  const sparkles = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${(i * 5.5 + (i % 3) * 2) % 100}%`, // Deterministik pozisyon
    delay: `${(i * 0.07) % 1.2}s`,
    duration: `${1.5 + (i % 5) * 0.2}s`,
  })), [])

  if (!fairy) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        animation: phase === 'enter'
          ? 'winx-backdrop-in 0.3s ease-out forwards'
          : 'winx-backdrop-out 0.5s ease-in forwards',
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sparkle rain */}
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="pointer-events-none absolute text-2xl"
          style={{
            left: s.left,
            top: '-30px',
            animation: `winx-sparkle-fall ${s.duration} ${s.delay} ease-in forwards`,
          }}
        >
          ✨
        </span>
      ))}

      {/* Center content */}
      <div
        className="relative flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-10 py-8 shadow-2xl"
        style={{
          animation: phase === 'enter'
            ? 'winx-scale-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards'
            : 'winx-scale-out 0.4s ease-in forwards',
          boxShadow: `0 0 60px ${fairy.color}40, 0 0 120px ${fairy.color}20`,
        }}
      >
        {/* Glow ring */}
        <div
          className="absolute -inset-1 rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${fairy.color}30, transparent, ${fairy.color}30)`,
            animation: 'winx-glow-pulse 1s ease-in-out infinite',
          }}
        />

        <Image
          src={fairy.image}
          alt={fairy.name}
          width={128}
          height={128}
          className="relative h-32 w-32 rounded-full object-cover"
          style={{ filter: `drop-shadow(0 0 20px ${fairy.color})` }}
        />
        <span className="relative text-2xl font-bold" style={{ color: fairy.color }}>
          {fairy.name}
        </span>
        <span className="relative text-sm text-muted-foreground">{fairy.power}</span>
        <div className="relative mt-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: fairy.color }}>
          {fairy.name} Gucuyle: {statusLabel}
        </div>
      </div>

      {/* Keyframes */}
      <style jsx>{`
        @keyframes winx-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes winx-backdrop-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes winx-scale-in {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes winx-scale-out {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.8); }
        }
        @keyframes winx-sparkle-fall {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(100vh) rotate(720deg); }
        }
        @keyframes winx-glow-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
