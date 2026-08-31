import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const COMPATIBILITY_MAP: Record<string, string[]> = {
  'O-':  ['O-'],
  'O+':  ['O-', 'O+'],
  'A-':  ['O-', 'A-'],
  'A+':  ['O-', 'O+', 'A-', 'A+'],
  'B-':  ['O-', 'B-'],
  'B+':  ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

async function sendTelegramAlert(chatId: number, text: string, replyMarkup: object) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API delivery error for chat ${chatId}:`, data);
  }
  return data;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { hospital_name, zone, target_blood_type, units_needed = 1, secret_key } = body;

    if (secret_key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hospital_name || !zone || !target_blood_type) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Create Emergency Ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('emergency_tickets')
      .insert({
        hospital_name,
        zone,
        target_blood_type,
        units_needed,
        status: 'open',
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error('Failed to create ticket:', ticketError);
      return NextResponse.json({ error: 'Failed to create emergency ticket' }, { status: 500 });
    }

    // 2. Query Donors
    const compatibleTypes = COMPATIBILITY_MAP[target_blood_type] || [target_blood_type];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: donors, error: donorError } = await supabaseAdmin
      .from('donors')
      .select('telegram_chat_id, blood_type')
      .eq('zone', zone)
      .eq('is_active', true)
      .in('blood_type', compatibleTypes)
      .or(`last_donated_at.is.null,last_donated_at.lte.${ninetyDaysAgo}`);

    if (donorError) {
      console.error('Donor fetch error:', donorError);
      return NextResponse.json({ error: 'Failed to fetch donors' }, { status: 500 });
    }

    if (!donors || donors.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Ticket created, but no matching donors found in system.',
        ticket_id: ticket.id,
        notified_count: 0,
      });
    }

    const targetDispatchCount = Math.ceil(units_needed * 1.5) + 1;
    const selectedDonors = donors.slice(0, targetDispatchCount);

    const alertPromises = selectedDonors.map((donor) => {
      const messageText = 
        `🚨 <b>URGENT BLOOD APPEAL | نداء عاجل</b>\n\n` +
        `🏥 <b>Hospital:</b> ${hospital_name}\n` +
        `🩸 <b>Blood Required:</b> ${target_blood_type}\n` +
        `📍 <b>Zone:</b> ${zone.toUpperCase()}\n` +
        `⏳ <b>Expires:</b> In 6 hours\n\n` +
        `Can you travel to ${hospital_name} to donate now?`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ I Can Donate (تأكيد الحضور)', callback_data: `pledge:${ticket.id}` }],
          [{ text: '❌ Cannot Right Now', callback_data: `decline:${ticket.id}` }],
        ],
      };

      return sendTelegramAlert(donor.telegram_chat_id, messageText, keyboard);
    });

    const results = await Promise.all(alertPromises);

    return NextResponse.json({
      ok: true,
      ticket_id: ticket.id,
      notified_donors: selectedDonors.length,
      delivery_results: results,
    });
  } catch (err) {
    console.error('Dispatch error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}