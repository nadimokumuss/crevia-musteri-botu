/**
 * Audit synthesis Zod sema'lari ve LLM tool input_schema.
 *
 * Sema'lar Anthropic'in `submit_audit` tool cagrisinin input'unu valide etmek
 * icin kullanilir. JSON Schema (tool input_schema icin) el yazisi tutulur ki
 * Anthropic'in structured-output kisitlamalarina uyumlu kalsin
 * (numerical/length constraints desteklenmez).
 */

import { z } from 'zod'

export const auditTierSchema = z.enum(['A', 'B', 'C'])
export const auditSeveritySchema = z.enum(['low', 'med', 'high'])

export const strengthSchema = z.object({
  area: z.string().min(1).max(80),
  note: z.string().min(1).max(400),
})

export const gapSchema = z.object({
  area: z.string().min(1).max(80),
  severity: auditSeveritySchema,
  note: z.string().min(1).max(400),
  talking_point: z.string().min(1).max(400),
})

export const auditSynthesisSchema = z.object({
  narrative: z.string().min(20).max(2000),
  strengths: z.array(strengthSchema).min(1).max(6),
  gaps: z.array(gapSchema).min(1).max(8),
  tier: auditTierSchema,
  phone_script: z.string().min(40).max(1200),
  outreach_email_subject: z.string().min(5).max(140),
  outreach_email_body: z.string().min(40).max(2400),
})

export type AuditSynthesisData = z.infer<typeof auditSynthesisSchema>
export type Strength = z.infer<typeof strengthSchema>
export type Gap = z.infer<typeof gapSchema>
export type AuditTier = z.infer<typeof auditTierSchema>
export type AuditSeverity = z.infer<typeof auditSeveritySchema>

/**
 * Anthropic tool input_schema (JSON Schema, draft 2020-12 subset).
 * `submit_audit` tool icin Claude'un dolduracagi JSON yapisini tanimlar.
 * `additionalProperties: false` butun objelerde, structured-output uyumlu.
 */
export const submitAuditToolInputSchema: {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
} = {
  type: 'object',
  properties: {
    narrative: {
      type: 'string',
      description:
        'Isletmenin online varligi (web sitesi, GBP, sosyal medya, yorum profili) hakkinda 2-3 paragrafli Turkce ozet. Konkre gozlemler — genel laflar yok.',
    },
    strengths: {
      type: 'array',
      description: 'Isletmenin guclu yonleri (1-6 madde). Mevcut digital varlikta calisan seyler.',
      items: {
        type: 'object',
        properties: {
          area: {
            type: 'string',
            description: 'Konu basligi (orn: "Yorum yanit orani", "GBP kategori secimi")',
          },
          note: {
            type: 'string',
            description: 'Tek cumlede gozlem',
          },
        },
        required: ['area', 'note'],
        additionalProperties: false,
      },
    },
    gaps: {
      type: 'array',
      description:
        'Eksik veya zayif alanlar (1-8 madde). Audit\'in en degerli kismi — Crevia\'nin cozecegi sorunlar burada.',
      items: {
        type: 'object',
        properties: {
          area: {
            type: 'string',
            description: 'Konu basligi (orn: "Web sitesi mobil performansi")',
          },
          severity: {
            type: 'string',
            enum: ['low', 'med', 'high'],
            description: 'Etkinin onceligi',
          },
          note: {
            type: 'string',
            description: 'Mevcut durumun gozlemi',
          },
          talking_point: {
            type: 'string',
            description:
              'Telefon ajaninin bu eksigi nasil dile getirecegi (1-2 cumle, dogal Turkce, satis dili)',
          },
        },
        required: ['area', 'severity', 'note', 'talking_point'],
        additionalProperties: false,
      },
    },
    tier: {
      type: 'string',
      enum: ['A', 'B', 'C'],
      description:
        'Audit kalite seviyesi. A: yuksek-deger lead (acik eksikler + iletisim hazir). B: orta — bazi eksikler mevcut ama hemen donusum dusuk. C: zayif sinyal — audit cikti var ama Crevia ile uyum dusuk.',
    },
    phone_script: {
      type: 'string',
      description:
        'Telefon ajaninin acilis konusmasi. 30-60 saniyelik script. Acilis + 1-2 gap reference + soru. Resmi ama samimi Turkce.',
    },
    outreach_email_subject: {
      type: 'string',
      description: 'Soguk e-posta konu satiri. 6-10 kelime, isletme adi gecmeli, spammy degil.',
    },
    outreach_email_body: {
      type: 'string',
      description:
        'Soguk e-posta govdesi. 80-150 kelime Turkce. Acilis, 2-3 gozlem (audit gaps\'den), tek call-to-action.',
    },
  },
  required: [
    'narrative',
    'strengths',
    'gaps',
    'tier',
    'phone_script',
    'outreach_email_subject',
    'outreach_email_body',
  ],
  additionalProperties: false,
}
