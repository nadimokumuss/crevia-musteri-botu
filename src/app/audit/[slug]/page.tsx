import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@/infra/supabase/server'

export const dynamic = 'force-dynamic'

type StrengthItem = { area?: unknown; note?: unknown } | unknown
type GapItem = {
  area?: unknown
  severity?: unknown
  note?: unknown
  talking_point?: unknown
} | unknown

type AuditView = {
  business_name: string
  category: string | null
  district: string | null
  narrative: string | null
  strengths: StrengthItem[] | null
  gaps: GapItem[] | null
  tier: 'A' | 'B' | 'C' | null
  generated_at: string | null
}

async function fetchAudit(slug: string): Promise<AuditView | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('leads')
    .select(
      `business_name,
       category,
       district_id,
       audit_narrative,
       audit_strengths,
       audit_gaps,
       audit_tier,
       audit_generated_at`
    )
    .eq('audit_share_slug', slug)
    .not('audit_generated_at', 'is', null)
    .maybeSingle()

  if (!data) return null

  let districtName: string | null = null
  if (data.district_id) {
    const { data: d } = await supabase
      .from('districts')
      .select('name')
      .eq('id', data.district_id)
      .maybeSingle()
    districtName = d?.name ?? null
  }

  return {
    business_name: data.business_name,
    category: data.category,
    district: districtName,
    narrative: data.audit_narrative,
    strengths: data.audit_strengths as StrengthItem[] | null,
    gaps: data.audit_gaps as GapItem[] | null,
    tier: data.audit_tier,
    generated_at: data.audit_generated_at,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const audit = await fetchAudit(slug)
  if (!audit) {
    return { title: 'Audit bulunamadi | Crevia' }
  }
  const title = `${audit.business_name} • Crevia Audit`
  const description = audit.narrative
    ? audit.narrative.slice(0, 160)
    : 'Crevia dijital varlik audit raporu'
  return {
    title,
    description,
    openGraph: { title, description },
    robots: { index: false, follow: false },
  }
}

const TIER_LABELS: Record<'A' | 'B' | 'C', string> = {
  A: 'Yuksek deger lead',
  B: 'Orta deger lead',
  C: 'Dusuk sinyal',
}

const TIER_COLORS: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-amber-100 text-amber-800 border-amber-200',
  C: 'bg-slate-100 text-slate-700 border-slate-200',
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800 border-rose-200',
  med: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

const SEVERITY_LABELS: Record<string, string> = {
  high: 'yuksek oncelik',
  med: 'orta oncelik',
  low: 'dusuk oncelik',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export default async function AuditSharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const audit = await fetchAudit(slug)

  if (!audit) {
    notFound()
  }

  const tier = audit.tier ?? 'C'
  const strengthsList = Array.isArray(audit.strengths) ? audit.strengths : []
  const gapsList = Array.isArray(audit.gaps) ? audit.gaps : []

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="container mx-auto max-w-3xl px-4 py-5 flex items-center justify-between">
          <span className="font-semibold tracking-tight text-slate-900">Crevia Sales OS</span>
          <span className="text-xs uppercase tracking-wider text-slate-500">Audit raporu</span>
        </div>
      </header>

      <article className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <section className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {audit.business_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {[audit.category, audit.district].filter(Boolean).join(' • ')}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${TIER_COLORS[tier]}`}
            >
              Tier {tier} — {TIER_LABELS[tier]}
            </span>
            {audit.generated_at && (
              <span className="text-xs text-slate-500">
                Uretildi: {formatDate(audit.generated_at)}
              </span>
            )}
          </div>
        </section>

        {audit.narrative && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Genel degerlendirme</h2>
            <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-line text-[15px] leading-relaxed">
              {audit.narrative}
            </div>
          </section>
        )}

        {strengthsList.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Guclu yonler</h2>
            <ul className="space-y-3">
              {strengthsList.map((raw, idx) => {
                const s = raw as { area?: unknown; note?: unknown }
                return (
                  <li
                    key={idx}
                    className="flex gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 text-xs font-bold"
                    >
                      ✓
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{asString(s.area)}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{asString(s.note)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {gapsList.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Gelistirme alanlari</h2>
            <ul className="space-y-3">
              {gapsList.map((raw, idx) => {
                const g = raw as {
                  area?: unknown
                  severity?: unknown
                  note?: unknown
                }
                const severity = asString(g.severity).toLowerCase()
                const sevClass = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low
                const sevLabel = SEVERITY_LABELS[severity] ?? severity
                return (
                  <li
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-900">{asString(g.area)}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sevClass}`}
                      >
                        {sevLabel}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{asString(g.note)}</p>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </article>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="container mx-auto max-w-3xl px-4 py-6 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>Crevia tarafindan olusturuldu</span>
          <span>Bu rapor yalnizca bilgilendirme amaclidir.</span>
        </div>
      </footer>
    </main>
  )
}
