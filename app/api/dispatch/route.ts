import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendAlert(chatId: number, text: string, keyboard: object): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) console.error(`Telegram sendMessage failed for ${chatId}:`, data);
    return data?.ok === true;
  } catch (err) {
    console.error(`Telegram fetch failed for ${chatId}:`, err);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (req.headers.get('authorization') !== `Bearer ${process.env.DISPATCH_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { hospital_name, zone, target_blood_type, units_needed } = await req.json();
    if (!hospital_name || !zone || !target_blood_type) {
      return NextResponse.json(
        { error: 'hospital_name, zone and target_blood_type are required' },
        { status: 400 }
      );
    }

    // 1. Create emergency ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('emergency_tickets')
      .insert({
        hospital_name,
        zone,
        target_blood_type,
        units_needed: units_needed ?? 1,
        status: 'open',
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error('Ticket creation failed:', ticketError);
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }

    // 2. Fetch matching donors — error is now checked, not swallowed
    const { data: donors, error: donorsError } = await supabaseAdmin
      .from('donors')
      .select('telegram_chat_id')
      .eq('zone', zone)          // NOTE: must be the slug, e.g. "alger_centre"
      .eq('blood_type', target_blood_type)
      .eq('is_active', true);

    if (donorsError) {
      console.error('Donor query failed:', donorsError);
      return NextResponse.json({ error: 'Donor query failed' }, { status: 500 });
    }

    if (!donors || donors.length === 0) {
      return NextResponse.json({ ok: true, notified_count: 0, ticket_id: ticket.id });
    }

    // 3. Broadcast in parallel (chunk if you ever exceed Telegram's ~30 msg/s)
    const units = units_needed ?? 1;
    const messageText =
      `🚨 <b>URGENT BLOOD APPEAL</b>\n\n` +
      `🏥 <b>Hospital:</b> ${esc(hospital_name)}\n` +
      `🩸 <b>Blood Required:</b> ${esc(target_blood_type)} (${units} unit${units > 1 ? 's' : ''})\n` +
      `📍 <b>Zone:</b> ${esc(zone)}\n\n` +
      `Can you donate now?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ I Can Donate', callback_data: `pledge:${ticket.id}` }],
        [{ text: '❌ Cannot Right Now', callback_data: `decline:${ticket.id}` }],
      ],
    };

    const results = await Promise.allSettled(
      donors.map((d) => sendAlert(d.telegram_chat_id, messageText, keyboard))
    );
    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({
      ok: true,
      notified_count: sentCount,
      matched_count: donors.length,
      ticket_id: ticket.id,
    });
  } catch (err) {
    console.error('Dispatch fatal error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}