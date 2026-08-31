import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

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

    // 1. Create emergency ticket
    const { data: emergency, error: emergencyError } = await supabaseAdmin
      .from('emergencies')
      .insert({
        hospital_name,
        wilaya_id,
        zone_id: zone_id ?? null,
        blood_type,
        units_needed: units_needed ?? 1,
        status: 'open',
      })
      .select()
      .single();

    if (emergencyError || !emergency) {
      console.error('Emergency creation failed:', emergencyError);
      return NextResponse.json({ error: 'Failed to create emergency record' }, { status: 500 });
    }

    // 2. Fetch matching active donors
    let query = supabaseAdmin
      .from('donors')
      .select('chat_id')
      .eq('wilaya_id', wilaya_id)
      .eq('blood_type', blood_type)
      .eq('is_active', true);

    if (zone_id) {
      query = query.eq('zone_id', zone_id);
    }

    const { data: donors, error: donorsError } = await query;

    if (donorsError) {
      console.error('Donor query failed:', donorsError);
      return NextResponse.json({ error: 'Donor query failed' }, { status: 500 });
    }

    if (!donors || donors.length === 0) {
      return NextResponse.json({
        ok: true,
        notified_count: 0,
        matched_count: 0,
        emergency_id: emergency.id,
      });
    }

    // 3. Prepare bilingual alert message
    const units = units_needed ?? 1;
    const alertText =
      `🚨 <b>نداء استغاثة عاجل للتبرع بالدم | ALERTE URGENCE</b>\n\n` +
      `🏥 <b>المستشفى / Hôpital:</b> ${esc(hospital_name)}\n` +
      `🩸 <b>فصيلة الدم المطلوبة / Groupe:</b> <code>${esc(blood_type)}</code> (${units} كيس/poche)\n\n` +
      `هل يمكنك التبرع الآن والمساعدة في إنقاذ حياة؟`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ أنا مستعد للتبرع (Je peux)', callback_data: `pledge:${emergency.id}` }],
        [{ text: '❌ لا أستطيع حاليًا (Indisponible)', callback_data: `decline:${emergency.id}` }],
      ],
    };

    // 4. Send alerts to all matching donors in parallel
    const results = await Promise.allSettled(
      donors.map((d) => sendTelegramAlert(d.chat_id, alertText, keyboard))
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({
      ok: true,
      notified_count: sentCount,
      matched_count: donors.length,
      emergency_id: emergency.id,
    });
  } catch (err) {
    console.error('Dispatch fatal error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}