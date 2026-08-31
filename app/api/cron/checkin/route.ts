import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function GET(req: Request) {
  // Authorization Check for Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Query pledges committed > 45 mins ago that haven't been verified or checked in
    const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const { data: pendingPledges, error } = await supabaseAdmin
      .from('pledges')
      .select('id, ticket_id, donor_id, donors(telegram_chat_id), emergency_tickets(hospital_name)')
      .eq('status', 'committed')
      .lte('created_at', fortyFiveMinsAgo);

    if (error || !pendingPledges) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    for (const pledge of pendingPledges) {
      const donorChatId = (pledge.donors as any)?.telegram_chat_id;
      const hospitalName = (pledge.emergency_tickets as any)?.hospital_name;

      if (donorChatId) {
        const checkinText = 
          `📍 <b>ARRIVAL CHECK-IN / تأكيد الوصول</b>\n\n` +
          `Have you arrived at <b>${hospitalName}</b> for your donation?`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '🏥 I Have Arrived at CTS', callback_data: `arrived:${pledge.id}` }],
            [{ text: '🚗 Still En Route (Need 15m)', callback_data: `delayed:${pledge.id}` }],
          ],
        };

        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: donorChatId,
            text: checkinText,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          }),
        });

        // Update pledge status so we don't re-prompt
        await supabaseAdmin
          .from('pledges')
          .update({ status: 'checkin_sent' })
          .eq('id', pledge.id);
      }
    }

    return NextResponse.json({ ok: true, processed: pendingPledges.length });
  } catch (err) {
    console.error('Cron checkin error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}