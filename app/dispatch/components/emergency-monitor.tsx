'use client'

import { Activity, Droplets, RefreshCw } from 'lucide-react'
import type { ConnectionState, EmergencyDTO, GeoLookup } from '@/lib/types'
import { cn, formatClockTime, formatNumber } from '@/lib/utils'
import { EmergencyCard } from './emergency-card'

interface EmergencyMonitorProps {
  emergencies: EmergencyDTO[]
  initialLoading: boolean
  refreshing: boolean
  connection: ConnectionState
  lastUpdated: number | null
  nowMs: number
  geo: GeoLookup
  closingId: string | null
  onClose: (id: string) => Promise<void>
  onManualRefresh: () => void
}

const CONNECTION_META: Record<ConnectionState, { label: string; dotClass: string; textClass: string; pulse: boolean }> = {
  realtime: { label: 'بث مباشر', dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', pulse: true },
  polling: { label: 'تحديث دوري', dotClass: 'bg-amber-400', textClass: 'text-amber-400', pulse: false },
  connecting: { label: 'جارٍ الاتصال…', dotClass: 'bg-zinc-500', textClass: 'text-zinc-400', pulse: false },
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="animate-pulse space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
          <div className="flex justify-between">
            <div className="h-5 w-28 rounded-full bg-zinc-800/80" />
            <div className="h-4 w-20 rounded bg-zinc-800/60" />
          </div>
          <div className="h-5 w-2/3 rounded bg-zinc-800/80" />
          <div className="h-2 w-full rounded-full bg-zinc-800/60" />
          <div className="h-8 w-1/2 rounded-lg bg-zinc-800/50" />
        </div>
      ))}
    </div>
  )
}

export function EmergencyMonitor(props: EmergencyMonitorProps) {
  const { emergencies, initialLoading, refreshing, connection, lastUpdated, nowMs, geo, closingId, onClose, onManualRefresh } = props
  const connectionMeta = CONNECTION_META[connection]

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-rose-500" />
          <h2 className="text-sm font-extrabold text-zinc-100">المراقبة الحية للنداءات</h2>
          {emergencies.length > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-400">
              {formatNumber(emergencies.length)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-[11px] font-bold', connectionMeta.textClass)}>
            <span className="relative flex h-1.5 w-1.5">
              {connectionMeta.pulse && (
                <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', connectionMeta.dotClass)} />
              )}
              <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', connectionMeta.dotClass)} />
            </span>
            {connectionMeta.label}
          </span>
          <button
            type="button"
            onClick={onManualRefresh}
            aria-label="تحديث الآن"
            title="تحديث الآن"
            className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2 text-[11px] text-zinc-600">
        <span>{connection === 'realtime' ? 'تحديث فوري + نبضة أمان كل 30 ثانية' : 'تحديث تلقائي كل 8 ثوانٍ'}</span>
        <span className="tabular-nums">آخر تحديث: {lastUpdated != null ? formatClockTime(lastUpdated) : '—'}</span>
      </div>

      <div className="ops-scroll flex-1 space-y-3 p-4 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
        {initialLoading ? (
          <FeedSkeleton />
        ) : emergencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-zinc-800 bg-zinc-900/50">
              <Droplets className="h-5 w-5 text-zinc-600" />
            </div>
            <p className="mt-4 text-sm font-bold text-zinc-300">لا توجد نداءات حاليًا</p>
            <p className="mt-1 text-xs text-zinc-600">عند إطلاق نداء جديد أو وصول تعهد، سيظهر هنا فورًا</p>
          </div>
        ) : (
          emergencies.map(emergency => (
            <EmergencyCard
              key={emergency.id}
              emergency={emergency}
              nowMs={nowMs}
              geo={geo}
              closing={closingId === emergency.id}
              onClose={id => { void onClose(id) }}
            />
          ))
        )}
      </div>
    </section>
  )
}