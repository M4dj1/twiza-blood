import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendAlert(chatId: number, text: string, keyboard: object) {
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
    const data = await res.json();
    console.log(`Telegram sendMessage result for ${chatId}:`, data);
    return data;
  } catch (err) {
    console.error(`Telegram fetch failed for ${chatId}:`, err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { hospital_name, zone, target_blood_type, secret_key } = body;

    if (secret_key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Create Emergency Ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('emergency_tickets')
      .insert({
        hospital_name,
        zone,
        target_blood_type,
        units_needed: 1,
        status: 'open',
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error('Ticket creation failed:', ticketError);
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }

    // 2. Fetch Matching Donors
    const { data: donors } = await supabaseAdmin
      .from('donors')
      .select('telegram_chat_id')
      .eq('zone', zone)
      .eq('blood_type', target_blood_type)
      .eq('is_active', true);

    if (!donors || donors.length === 0) {
      return NextResponse.json({ ok: true, notified_count: 0, ticket_id: ticket.id });
    }

    // 3. Send Telegram Messages
    const messageText = 
      `🚨 <b>URGENT BLOOD APPEAL</b>\n\n` +
      `🏥 <b>Hospital:</b> ${hospital_name}\n` +
      `🩸 <b>Blood Required:</b> ${target_blood_type}\n\n` +
      `Can you donate now?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ I Can Donate', callback_data: `pledge:${ticket.id}` }],
        [{ text: '❌ Cannot Right Now', callback_data: `decline:${ticket.id}` }],
      ],
    };

    let sentCount = 0;
    for (const donor of donors) {
      const result = await sendAlert(donor.telegram_chat_id, messageText, keyboard);
      if (result && result.ok) sentCount++;
    }

    return NextResponse.json({ ok: true, notified_count: sentCount, ticket_id: ticket.id });
  } catch (err) {
    console.error('Dispatch fatal error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}