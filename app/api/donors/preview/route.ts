import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { COMPATIBLE_DONORS, isBloodType } from '@/lib/blood'

export const dynamic = 'force-dynamic'

async function countActiveDonors(wilayaId: number, bloodTypes: string[], zoneId: number | null): Promise<number> {
  let query = supabaseAdmin
    .from('donors')
    .select('id', { count: 'exact', head: true })
    .eq('wilaya_id', wilayaId)
    .eq('is_active', true)
    .in('blood_type', bloodTypes)
  if (zoneId != null) query = query.eq('zone_id', zoneId)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const wilayaId = Number(searchParams.get('wilaya_id'))
    const zoneParam = searchParams.get('zone_id')
    const zoneId = zoneParam != null && zoneParam !== '' ? Number(zoneParam) : null
    const bloodType = searchParams.get('blood_type')

    if (!Number.isInteger(wilayaId) || wilayaId <= 0) {
      return NextResponse.json({ error: 'wilaya_id صالح مطلوب' }, { status: 400 })
    }
    if (!isBloodType(bloodType)) {
      return NextResponse.json({ error: 'blood_type غير صالح' }, { status: 400 })
    }

    const compatible = COMPATIBLE_DONORS[bloodType]

    const [wilayaDirect, wilayaCompatible, zoneDirect, zoneCompatible] = await Promise.all([
      countActiveDonors(wilayaId, [bloodType], null),
      countActiveDonors(wilayaId, compatible as string[], null),
      zoneId != null ? countActiveDonors(wilayaId, [bloodType], zoneId) : Promise.resolve(null),
      zoneId != null ? countActiveDonors(wilayaId, compatible as string[], zoneId) : Promise.resolve(null),
    ])

    return NextResponse.json(
      {
        zone: zoneId != null ? { direct: zoneDirect ?? 0, compatible: zoneCompatible ?? 0 } : null,
        wilaya: { direct: wilayaDirect, compatible: wilayaCompatible },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('GET /api/donors/preview error:', err)
    return NextResponse.json({ error: 'تعذّر حساب مجموعة المتبرعين' }, { status: 500 })
  }
}