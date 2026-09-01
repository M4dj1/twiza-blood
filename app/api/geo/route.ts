import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [wilayasRes, zonesRes] = await Promise.all([
    supabaseAdmin.from('wilayas').select('id, name, name_ar').order('id'),
    supabaseAdmin.from('zones').select('id, wilaya_id, name, name_ar').order('wilaya_id').order('id'),
  ])

  if (wilayasRes.error || zonesRes.error) {
    console.error('GET /api/geo error:', wilayasRes.error ?? zonesRes.error)
    return NextResponse.json({ error: 'تعذّر تحميل الولايات والمناطق' }, { status: 500 })
  }

  return NextResponse.json(
    { wilayas: wilayasRes.data ?? [], zones: zonesRes.data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}