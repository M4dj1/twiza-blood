'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Droplet, Loader2, MapPin, X } from 'lucide-react'
import type { EmergencyDTO, GeoLookup } from '@/lib/types'
import { cn, formatNumber, formatRelativeAr } from '@/lib/utils'

interface EmergencyCardProps {
  emergency: EmergencyDTO
  nowMs: number
  geo: GeoLookup
  closing: boolean
  onClose: (id: string) => void
}

interface StatusMeta {
  label: string; chipClass: string; edgeClass: string; dotClass: string; barClass: string | null; pulse: boolean
}

const STATUS_META: Record<string, StatusMeta> = {
  open: {
    label: 'جاري البحث',
    chipClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    edgeClass: 'border-s-amber-400/80',
    dotClass: 'bg-amber-400',
    barClass: null, // computed: rose while hunting, emerald once quota met
    pulse: true,
  },
  fulfilled: {
    label: 'تمت التغطية',
    chipClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    edgeClass: 'border-s-emerald-400/80',
    dotClass: 'bg-emerald-400',
    barClass: 'bg-emerald-500',
    pulse: false,
  },
  closed: {
    label: 'مغلق',
    chipClass: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    edgeClass: 'border-s-rose-500/70',
    dotClass: 'bg-rose-500',
    barClass: 'bg-zinc-600',
    pulse: false,
  },
}

/** Map these to whatever status strings your Telegram bot writes into `pledges.status` */
const PLEDGE_STATUS_META: Record<string, { label: string; chipClass: string }> = {
  pledged: { label: 'تعهّد بالحضور', chipClass: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' },
  fulfilled: { label: 'تبرّع', chipClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' },
  declined: { label: 'اعتذر', chipClass: 'border-zinc-700 bg-zinc-800/60 text-zinc-500' },
  cancelled: { label: 'أُلغي', chipClass: 'border-zinc-700 bg-zinc-800/60 text-zinc-500' },
}

function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? {
    label: status,
    chipClass: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
    edgeClass: 'border-s-zinc-700',
    dotClass: 'bg-zinc-500',
    barClass: 'bg-zinc-600',
    pulse: false,
  }
}

function joinLocation(geo: GeoLookup, wilayaId: number | null, zoneId: number | null): string {
  return [geo.wilayaName(wilayaId), geo.zoneName(zoneId)]
    .filter((part): part is string => part != null)
    .join(' · ')
}

export function EmergencyCard({ emergency, nowMs, geo, closing, onClose }: EmergencyCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // auto-cancel the close confirmation after 4s
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  const meta = statusMeta(emergency.status)
  const quotaMet = emergency.units_needed > 0 && emergency.pledges_count >= emergency.units_needed
  const progressPct = emergency.units_needed > 0
    ? Math.min(100, Math.round((emergency.pledges_count / emergency.units_needed) * 100))
    : 0
  const barClass = meta.barClass ?? (quotaMet ? 'bg-emerald-500' : 'bg-rose-500')
  const location = joinLocation(geo, emergency.wilaya_id, emergency.zone_id) || 'ولاية غير محددة'

  return (
    <article className={cn('rise-in rounded-xl border border-zinc-800/70 border-s-4 bg-zinc-900/40 p-4', meta.edgeClass)}>
      {/* status + time */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold', meta.chipClass)}>
          <span className="relative flex h-1.5 w-1.5">
            {meta.pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', meta.dotClass)} />}
            <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', meta.dotClass)} />
          </span>
          {meta.label}
        </span>
        <time className="text-[11px] tabular-nums text-zinc-500">{formatRelativeAr(emergency.created_at, nowMs)}</time>
      </div>

      {/* hospital + blood badge */}
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold leading-6 text-zinc-100">{emergency.hospital_name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {location}
          </p>
        </div>
        <span dir="ltr" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-sm font-extrabold text-rose-400">
          <Droplet className="h-4 w-4" />
          {emergency.blood_type}
        </span>
      </div>

      {/* progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span className="tabular-nums">
            التعهدات: {formatNumber(emergency.pledges_count)} / {formatNumber(emergency.units_needed)} كيس
          </span>
          <span className={cn('tabular-nums font-bold', quotaMet ? 'text-emerald-400' : 'text-zinc-400')}>{progressPct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800/80">
          <div className={cn('h-full rounded-full transition-all duration-500', barClass)} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* footer: pledges toggle + close action */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-3">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 transition-colors hover:text-zinc-200"
        >
          تعهدات المتبرعين
          <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-300">
            {formatNumber(emergency.pledges.length)}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
        </button>

        {emergency.status === 'open' && (
          confirming ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setConfirming(false); onClose(emergency.id) }}
                disabled={closing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
              >
                {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {closing ? 'جارٍ الإغلاق…' : 'تأكيد الإغلاق'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:text-zinc-200"
              >
                تراجع
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-400"
            >
              <X className="h-3.5 w-3.5" />
              إغلاق النداء
            </button>
          )
        )}
      </div>

      {/* expandable pledges list — grid-rows trick for a smooth height animation */}
      <div className={cn('grid transition-all duration-300 ease-out', expanded ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          {emergency.pledges.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
              لم تصل تعهدات بعد — بانتظار ردود المتبرعين عبر تيليغرام…
            </p>
          ) : (
            <ul className="space-y-2">
              {emergency.pledges.map(pledge => {
                const donor = pledge.donor
                const donorLocation = donor ? joinLocation(geo, donor.wilaya_id, donor.zone_id) : ''
                const pledgeMeta = PLEDGE_STATUS_META[pledge.status]
                  ?? { label: pledge.status, chipClass: 'border-zinc-700 bg-zinc-800/60 text-zinc-400' }
                return (
                  <li key={pledge.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {donor?.blood_type ? (
                        <span dir="ltr" className="inline-flex w-11 justify-center rounded border border-rose-500/20 bg-rose-500/10 py-0.5 text-[11px] font-extrabold text-rose-400">
                          {donor.blood_type}
                        </span>
                      ) : (
                        <span dir="ltr" className="grid h-5 w-11 place-items-center rounded border border-zinc-700 text-[10px] text-zinc-600">—</span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-zinc-300">متبرع #{donor ? donor.id.slice(0, 4) : '----'}</p>
                        <p className="truncate text-[10px] text-zinc-600">{donorLocation || 'موقع غير محدد'}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', pledgeMeta.chipClass)}>{pledgeMeta.label}</span>
                      <span className="text-[10px] tabular-nums text-zinc-600">{formatRelativeAr(pledge.created_at, nowMs)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}