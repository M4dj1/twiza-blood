import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ABO / Rh Compatibility Matrix (Recipient -> Compatible Donors)
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
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { hospital_name, zone, target_blood_type, units_needed = 1, secret_key } = body;

    // Basic API Authentication Guard
    if (secret_key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hospital_name || !zone || !target_blood_type) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Create Open Emergency Ticket (TTL default 6 Hours)
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

    // 2. Determine Compatible Blood Phenotypes
    const compatibleTypes = COMPATIBILITY_MAP[target_blood_type] || [target_blood_type];

    // 3. Query Active, Non-Cooldown Donors in Target Zone
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: donors, error: donorError } = await supabaseAdmin
      .from('donors')
      .select('telegram_chat_id, blood_type')
      .eq('zone', zone)
      .eq('is_active', true)
      .in('blood_type', compatibleTypes)
      .or(`last_donated_at.is.null,last_donated_at.lte.${ninetyDaysAgo}`);

    if (donorError || !donors || donors.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Ticket created, but no matching available donors found in zone.',
        ticket_id: ticket.id,
        notified_count: 0,
      });
    }

    // 4. Over-Provisioning Limit (1.5x buffer)
    const targetDispatchCount = Math.ceil(units_needed * 1.5) + 1;
    const selectedDonors = donors.slice(0, targetDispatchCount);

    // 5. Broadcast Emergency Alerts via Telegram
    const alertPromises = selectedDonors.map((donor) => {
      const messageText = `🚨 *URGENT BLOOD APPEAL / نداء عاجل*\n\n` +
        `🏥 *Hospital:* ${hospital_name}\n` +
        `🩸 *Blood Required:* ${target_blood_type}\n` +
        `📍 *Zone:* ${zone.toUpperCase()}\n` +
        `⏳ *Ticket Expires:* In 6 hours\n\n` +
        `Can you travel to ${hospital_name} to donate now?`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ I Can Donate (تأكيد الحضور)', callback_data: `pledge:${ticket.id}` }],
          [{ text: '❌ Cannot Right Now', callback_data: `decline:${ticket.id}` }],
        ],
      };

      return sendTelegramAlert(donor.telegram_chat_id, messageText, keyboard);
    });

    await Promise.all(alertPromises);

    return NextResponse.json({
      ok: true,
      ticket_id: ticket.id,
      notified_donors: selectedDonors.length,
    });
  } catch (err) {
    console.error('Dispatch error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}