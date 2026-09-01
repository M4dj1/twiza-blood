'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Droplet } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type {
  ApiError, ConnectionState, DispatchPayload, DispatchResponse,
  EmergencyFeedResponse, GeoLookup, GeoResponse,
} from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import EmergencyForm from './components/emergency-form'
import { EmergencyMonitor } from './components/emergency-monitor'
import { LiveClock } from './components/live-clock'
import { StatsBar } from './components/stats-bar'

export default function DispatchDashboard() {
  const { toast } = useToast()

  const [geoData, setGeoData] = useState<GeoResponse | null>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [feed, setFeed] = useState<EmergencyFeedResponse | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

  /* ---------------- data fetching ---------------- */

  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? false
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/emergencies', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setFeed((await res.json()) as EmergencyFeedResponse)
      setLastUpdated(Date.now())
    } catch (err) {
      // Background (polling/realtime) failures stay silent — no toast storms.
      if (!silent) {
        toast({ variant: 'error', title: 'تعذّر جلب البيانات', description: 'تحقّق من اتصال الخادم ثم أعد المحاولة' })
      } else {
        console.warn('Background refresh failed:', err)
      }
    } finally {
      setRefreshing(false)
      setInitialLoading(false)
    }
  }, [toast])

  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  // Realtime events arrive in bursts → debounce into one refetch
  const pendingRealtimeRefresh = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRefresh = useCallback(() => {
    if (pendingRealtimeRefresh.current) clearTimeout(pendingRealtimeRefresh.current)
    pendingRealtimeRefresh.current = setTimeout(() => { void refreshRef.current({ silent: true }) }, 600)
  }, [])
  useEffect(() => () => {
    if (pendingRealtimeRefresh.current) clearTimeout(pendingRealtimeRefresh.current)
  }, [])

  // initial load
  useEffect(() => {
    void refreshRef.current()
    void (async () => {
      try {
        const res = await fetch('/api/geo', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setGeoData((await res.json()) as GeoResponse)
      } catch {
        toast({ variant: 'error', title: 'تعذّر تحميل الولايات والمناطق', description: 'أعد تحميل الصفحة أو تحقّق من الخادم' })
      } finally {
        setGeoLoading(false)
      }
    })()
  }, [toast])

  // ticker: keeps "منذ …" labels fresh
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // heartbeat: safety net while on realtime (30s), main channel while polling (8s)
  useEffect(() => {
    const intervalMs = connection === 'realtime' ? 30_000 : 8_000
    const id = setInterval(() => { void refreshRef.current({ silent: true }) }, intervalMs)
    return () => clearInterval(id)
  }, [connection])

  // Realtime push — pure change-signal; auto-degrades to polling
  useEffect(() => {
    if (!supabaseBrowser) {
      setConnection('polling')
      return
    }
    const client = supabaseBrowser
    const channel = client
      .channel('twiza-dispatch-ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergencies' }, () => queueRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pledges' }, () => queueRefresh())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('realtime')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('polling')
      })
    return () => { void client.removeChannel(channel) }
  }, [queueRefresh])

  /* ---------------- actions ---------------- */

  const dispatchEmergency = useCallback(async (payload: DispatchPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as DispatchResponse | ApiError
      if (!res.ok || 'error' in data) {
        toast({ variant: 'error', title: 'فشل إطلاق النداء', description: 'error' in data ? data.error : 'حدث خطأ غير متوقع في الخادم' })
        return false
      }
      const scopeNote = data.scope === 'wilaya_fallback' ? ' — وُسِّع النطاق ليشمل كامل الولاية' : ''
      if (data.notified_count === 0 && data.matched_count === 0) {
        toast({ variant: 'info', title: 'سُجّل النداء دون إشعارات', description: 'لا يوجد متبرعون نشطون متوافقون في النطاق المحدد — فكّر في توسيع النطاق' })
      } else if (data.notified_count === 0) {
        toast({ variant: 'info', title: 'سُجّل النداء', description: `وُجد ${formatNumber(data.matched_count)} متبرعًا مطابقًا لكن تعذّر إرسال إشعارات تيليغرام` })
      } else {
        toast({
          variant: 'success',
          title: 'انطلق نداء الاستغاثة',
          description: `أُشعِر ${formatNumber(data.notified_count)} متبرعًا من أصل ${formatNumber(data.matched_count)} في قائمة الاستهداف${scopeNote}`,
        })
      }
      void refreshRef.current({ silent: true })
      return true
    } catch {
      toast({ variant: 'error', title: 'تعذّر الاتصال بالخادم', description: 'تحقّق من الشبكة وأعد المحاولة' })
      return false
    } finally {
      setSubmitting(false)
    }
  }, [toast])

  const closeEmergency = useCallback(async (id: string) => {
    setClosingId(id)
    try {
      const res = await fetch('/api/emergencies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'closed' }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null
        toast({ variant: 'error', title: 'تعذّر إغلاق النداء', description: data?.error ?? 'حدث خطأ في الخادم' })
        return
      }
      toast({ variant: 'success', title: 'أُغلق النداء', description: 'تم تحديث الحالة إلى «مغلق» في السجل' })
      await refreshRef.current({ silent: true })
    } catch {
      toast({ variant: 'error', title: 'تعذّر الاتصال بالخادم' })
    } finally {
      setClosingId(null)
    }
  }, [toast])

  const handleManualRefresh = useCallback(() => { void refresh() }, [refresh])

  /* ---------------- derived ---------------- */

  const geo: GeoLookup = useMemo(() => {
    const wilayaMap = new Map<number, { name_ar: string; name: string }>()
    const zoneMap = new Map<number, { name_ar: string; name: string }>()
    geoData?.wilayas.forEach(w => wilayaMap.set(w.id, w))
    geoData?.zones.forEach(z => zoneMap.set(z.id, z))
    return {
      wilayaName: id => (id != null ? wilayaMap.get(id)?.name_ar ?? wilayaMap.get(id)?.name ?? null : null),
      zoneName: id => (id != null ? zoneMap.get(id)?.name_ar ?? zoneMap.get(id)?.name ?? null : null),
    }
  }, [geoData])

  /* ---------------- render ---------------- */

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-600 shadow-lg shadow-rose-950/40">
            <Droplet className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-lg font-extrabold leading-6">مركز عمليات نداءات الدم</h1>
              <span dir="ltr" className="text-[10px] font-bold uppercase tracking-widest text-rose-500/90">Twiza Blood</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">إرسال استغاثات التبرع العاجلة ومراقبة الاستجابة لحظة بلحظة</p>
          </div>
        </div>
        <LiveClock />
      </header>

      <div className="mt-6">
        <StatsBar stats={feed?.stats ?? null} loading={initialLoading} />
      </div>

      <div className="mt-6 grid flex-1 items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
        <section aria-label="إنشاء نداء استغاثة">
          {geoLoading ? <FormSkeleton /> : (
            <EmergencyForm
              wilayas={geoData?.wilayas ?? []}
              zones={geoData?.zones ?? []}
              submitting={submitting}
              onDispatch={dispatchEmergency}
            />
          )}
        </section>

        <section aria-label="المراقبة الحية للنداءات">
          <EmergencyMonitor
            emergencies={feed?.emergencies ?? []}
            initialLoading={initialLoading}
            refreshing={refreshing}
            connection={connection}
            lastUpdated={lastUpdated}
            nowMs={nowMs}
            geo={geo}
            closingId={closingId}
            onClose={closeEmergency}
            onManualRefresh={handleManualRefresh}
          />
        </section>
      </div>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
      <div className="flex items-center gap-3 border-b border-zinc-800/70 px-5 py-4">
        <div className="h-9 w-9 rounded-lg bg-zinc-800" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-zinc-800" />
          <div className="h-2.5 w-44 rounded bg-zinc-800/70" />
        </div>
      </div>
      <div className="space-y-6 px-5 py-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-zinc-800" />
            <div className="h-11 rounded-lg bg-zinc-800/70" />
          </div>
        ))}
      </div>
    </div>
  )
}