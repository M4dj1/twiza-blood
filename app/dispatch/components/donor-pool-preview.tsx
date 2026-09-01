'use client'

import { AlertTriangle, MapPin, MousePointerClick, Users } from 'lucide-react'
import type { BloodType, DonorPoolPreviewResponse } from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'

interface DonorPoolPreviewProps {
  bloodType: BloodType | null
  wilayaId: number | null
  zoneId: number | null
  units: number
  preview: DonorPoolPreviewResponse | null
  loading: boolean
  zoneName: string | null
  wilayaName: string | null
}

function StatBlock({ label, sub, value, loading, accent = false }: {
  label: string; sub: string; value: number | null; loading: boolean; accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/40 p-3">
      <p className="text-[11px] font-bold text-zinc-500">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-7 w-14 animate-pulse rounded bg-zinc-800/80" />
      ) : (
        <p className={cn('mt-0.5 text-2xl font-extrabold tabular-nums leading-7', accent ? 'text-rose-400' : 'text-zinc-100')}>
          {formatNumber(value ?? 0)}
          <span className="ms-1.5 text-[11px] font-normal text-zinc-500">متبرعًا</span>
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>
    </div>
  )
}

export function DonorPoolPreview(props: DonorPoolPreviewProps) {
  const { bloodType, wilayaId, zoneId, units, preview, loading, zoneName, wilayaName } = props

  const hasScope = wilayaId != null && bloodType != null
  const zoneScoped = zoneId != null
  const primary = hasScope && preview ? (zoneScoped ? preview.zone ?? preview.wilaya : preview.wilaya) : null

  // Mirrors MIN_DONOR_POOL = units * 3 in /api/dispatch
  const zoneCounts = zoneScoped ? preview?.zone ?? null : null
  const needsFallback = zoneCounts != null && zoneCounts.compatible < units * 3
  const isEmptyPool = primary != null && primary.compatible === 0 && primary.direct === 0

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-bold text-zinc-300">معاينة حية — مجموعة المتبرعين</h3>
        </div>
        {hasScope && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        )}
      </header>

      <div className="mt-3">
        {!hasScope ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-[11px] text-zinc-600">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
            حدّد الولاية وفصيلة الدم لعرض حجم مجموعة المتبرعين المتاحين
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {zoneScoped ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400">
                  <MapPin className="h-3 w-3" />
                  النطاق: {zoneName ?? 'المنطقة'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-400">
                  <MapPin className="h-3 w-3" />
                  النطاق: كامل الولاية
                </span>
              )}
              {wilayaName && <span className="truncate text-[11px] text-zinc-600">{wilayaName}</span>}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <StatBlock label="تطابق تام" sub="نفس فصيلة المريض" value={primary?.direct ?? null} loading={loading} accent />
              <StatBlock label="متوافقون RBC" sub="بما فيهم المطابقون تمامًا" value={primary?.compatible ?? null} loading={loading} />
            </div>

            {needsFallback && zoneCounts != null && preview && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-300/90">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                مجموعة المنطقة ({formatNumber(zoneCounts.compatible)} متبرعًا) أقل من الحد الأدنى للبث ({formatNumber(units * 3)}) —
                عند الإطلاق سيُوسَّع النداء تلقائيًا ليشمل كامل الولاية ({formatNumber(preview.wilaya.compatible)} متبرعًا متوافقًا).
              </p>
            )}

            {!needsFallback && isEmptyPool && (
              <p className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5 text-[11px] leading-relaxed text-rose-300/90">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                لا يوجد متبرعون نشطون متوافقون في هذا النطاق — فكّر في توسيع نطاق البث أو فصيلة أخرى.
              </p>
            )}

            {zoneScoped && preview != null && !needsFallback && (
              <p className="text-[11px] text-zinc-600">
                كامل الولاية: {formatNumber(preview.wilaya.compatible)} متبرعًا متوافقًا
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}