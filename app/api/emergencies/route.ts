import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { EmergencyDTO, EmergencyFeedResponse, OpsStats, PledgeDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

const RECENT_WINDOW_HOURS = 48 // show open tickets + anything from the last 48h
const MAX_FEED_ITEMS = 30
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS_PRIORITY: Record<string, number> = { open: 0, fulfilled: 1, closed: 2 }
const ALLOWED_STATUSES = ['closed', 'fulfilled'] as const

interface EmergencyRow {
  id: string; hospital_name: string; wilaya_id: number; zone_id: number | null
  blood_type: string; units_needed: number; pledges_count: number; status: string; created_at: string
}

/**
 * GET — active + recent emergencies (with joined pledges) and KPI stats.
 * All queries use the service-role client: RLS is irrelevant here.
 */
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_HOURS * 3_600_000).toISOString()
    const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString()

    const [emergenciesRes, openCountRes, openUnitsRes, pledges24hRes, donorsRes] = await Promise.all([
      supabaseAdmin
        .from('emergencies')
        .select('id, hospital_name, wilaya_id, zone_id, blood_type, units_needed, pledges_count, status, created_at')
        .or(`status.eq.open,created_at.gte.${cutoff}`)
        .order('created_at', { ascending: false })
        .limit(MAX_FEED_ITEMS),
      supabaseAdmin.from('emergencies').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabaseAdmin.from('emergencies').select('units_needed').eq('status', 'open').limit(5000),
      supabaseAdmin.from('pledges').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      supabaseAdmin.from('donors').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])

    if (emergenciesRes.error) {
      console.error('GET /api/emergencies feed error:', emergenciesRes.error)
      return NextResponse.json({ error: 'فشل جلب النداءات' }, { status: 500 })
    }
    for (const res of [openCountRes, openUnitsRes, pledges24hRes, donorsRes]) {
      if (res.error) console.warn('stats query degraded:', res.error.message)
    }

    const emergencies = (emergenciesRes.data ?? []) as unknown as EmergencyRow[]

    // pledges grouped per ticket (oldest first → feed order = commitment order)
    const pledgesByTicket = new Map<string, PledgeDTO[]>()
    if (emergencies.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('pledges')
        .select('id, ticket_id, status, created_at, donor:donors(id, blood_type, wilaya_id, zone_id)')
        .in('ticket_id', emergencies.map(e => e.id))
        .order('created_at', { ascending: true })
      if (error) console.warn('pledges join warning:', error.message)
      for (const row of (data ?? []) as unknown as PledgeDTO[]) {
        const list = pledgesByTicket.get(row.ticket_id)
        if (list) list.push(row)
        else pledgesByTicket.set(row.ticket_id, [row])
      }
    }

    const feed: EmergencyDTO[] = emergencies
      .map(e => ({ ...e, pledges: pledgesByTicket.get(e.id) ?? [] }))
      .sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 3
        const pb = STATUS_PRIORITY[b.status] ?? 3
        if (pa !== pb) return pa - pb
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

    const stats: OpsStats = {
      active_emergencies: openCountRes.count ?? 0,
      open_units_needed: ((openUnitsRes.data ?? []) as unknown as Array<{ units_needed: number | null }>).reduce(
        (sum, row) => sum + (row.units_needed ?? 0), 0),
      pledges_last_24h: pledges24hRes.count ?? 0,
      active_donors: donorsRes.count ?? 0,
    }

    const payload: EmergencyFeedResponse = { emergencies: feed, stats, server_time: new Date().toISOString() }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('GET /api/emergencies fatal:', err)
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 })
  }
}

/**
 * PATCH — close (or mark fulfilled) a ticket.
 * PRIVILEGED: internal ops endpoint — gate it behind session/middleware auth
 * before exposing this dashboard beyond the operations room.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null
    const id = typeof body?.id === 'string' ? body.id.trim() : null
    const status = typeof body?.status === 'string' ? body.status : null

    if (!id || !UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'معرّف نداء صالح مطلوب' }, { status: 400 })
    }
    if (status == null || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json({ error: "status يجب أن يكون 'closed' أو 'fulfilled'" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('emergencies')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'النداء غير موجود أو تعذّر تحديثه' }, { status: 404 })
    }

    const row = data as { id: string; status: string }
    return NextResponse.json({ ok: true, id: row.id, status: row.status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('PATCH /api/emergencies fatal:', err)
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 })
  }
}