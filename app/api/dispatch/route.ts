import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Medical RBC Compatibility Map: Target Blood Type -> Compatible Donor Blood Types
const COMPATIBLE_DONORS_MAP: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegramAlert(chatId: number, text: string, keyboard: object): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    });
    const data = await res.json().catch(() => null);
    return data?.ok === true;
  } catch (err) {
    console.error(`Telegram fetch failed for ${chatId}:`, err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hospital_name, wilaya_id, zone_id, blood_type, units_needed } = body;

    if (!hospital_name || !wilaya_id || !blood_type) {
      return NextResponse.json(
        { error: 'hospital_name, wilaya_id, and blood_type are required' },
        { status: 400 }
      );
    }

    const units = units_needed ?? 1;
    const compatibleBloodTypes = COMPATIBLE_DONORS_MAP[blood_type] || [blood_type];

    // 1. Create emergency ticket
    const { data: emergency, error: emergencyError } = await supabaseAdmin
      .from('emergencies')
      .insert({
        hospital_name,
        wilaya_id,
        zone_id: zone_id ?? null,
        blood_type,
        units_needed: units,
        pledges_count: 0,
        status: 'open',
      })
      .select()
      .single();

    if (emergencyError || !emergency) {
      console.error('Emergency creation failed:', emergencyError);
      return NextResponse.json({ error: 'Failed to create emergency record' }, { status: 500 });
    }

    // 2. Fetch Donors - Include blood_type so we can tailor the message per donor
    let donors: { chat_id: number; blood_type: string }[] = [];
    let dispatchScope = 'zone';

    if (zone_id) {
      const { data: zoneDonors, error: zoneError } = await supabaseAdmin
        .from('donors')
        .select('chat_id, blood_type')
        .eq('wilaya_id', wilaya_id)
        .eq('zone_id', zone_id)
        .in('blood_type', compatibleBloodTypes)
        .eq('is_active', true);

      if (!zoneError && zoneDonors) {
        donors = zoneDonors;
      }
    }

    // Stage 2: Geographic Fallback if local pool is small
    const MIN_DONOR_POOL = units * 3;
    if (donors.length < MIN_DONOR_POOL) {
      const { data: wilayaDonors, error: wilayaError } = await supabaseAdmin
        .from('donors')
        .select('chat_id, blood_type')
        .eq('wilaya_id', wilaya_id)
        .in('blood_type', compatibleBloodTypes)
        .eq('is_active', true);

      if (!wilayaError && wilayaDonors && wilayaDonors.length > donors.length) {
        donors = wilayaDonors;
        dispatchScope = 'wilaya_fallback';
      }
    }

    if (!donors || donors.length === 0) {
      return NextResponse.json({
        ok: true,
        notified_count: 0,
        matched_count: 0,
        scope: dispatchScope,
        emergency_id: emergency.id,
      });
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ أنا مستعد للتبرع', callback_data: `pledge:${emergency.id}` },
          { text: '❌ غير متاح الآن', callback_data: `decline:${emergency.id}` },
        ],
      ],
    };

    // 3. Dispatch Personalized Messages (Exact vs Compatible)
    const results = await Promise.allSettled(
      donors.map((donor) => {
        const isExactMatch = donor.blood_type === blood_type;

        let bloodInfoText = '';
        if (isExactMatch) {
          bloodInfoText = `🩸 <b>الفصيلة المطلوبة:</b> <b>${esc(blood_type)}</b> (تطابق تام مع فصيلتك)\n`;
        } else {
          bloodInfoText =
            `🩸 <b>فصيلة المريض:</b> <b>${esc(blood_type)}</b>\n` +
            `💡 <b>تنبيه طبي:</b> فصيلتك (<b>${esc(donor.blood_type)}</b>) متوافقة تمامًا ويمكنها إنقاذ هذا المريض!\n`;
        }

        const alertText =
          `🚨 <b>نداء استغاثة عاجل للتبرع بالدم</b>\n\n` +
          `🏥 <b>المستشفى:</b> ${esc(hospital_name)}\n` +
          `${bloodInfoText}` +
          `📦 <b>الاحتياج:</b> ${units} أكياس\n\n` +
          `هل أنت متاح وقادر على التبرع الآن؟`;

        return sendTelegramAlert(donor.chat_id, alertText, keyboard);
      })
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({
      ok: true,
      notified_count: sentCount,
      matched_count: donors.length,
      scope: dispatchScope,
      compatible_groups: compatibleBloodTypes,
      emergency_id: emergency.id,
    });
  } catch (err) {
    console.error('Dispatch fatal error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}