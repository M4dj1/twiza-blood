import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || '',
    }),
  });
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: object) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML', // Switched to HTML for uniform stability
      reply_markup: replyMarkup,
    }),
  });
  return res.json();
}

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // 1. Handle /start Command
    if (update.message?.text === '/start') {
      const chatId = update.message.chat.id;

      const keyboard = {
        inline_keyboard: [
          [{ text: 'Alger Centre (Mustapha, Bab El Oued)', callback_data: 'zone:alger_centre' }],
          [{ text: 'Alger Ouest (Béni Messous, Douera, Zéralda)', callback_data: 'zone:alger_ouest' }],
          [{ text: 'Alger Est & Sud (Hussein Dey, Kouba, Rouïba)', callback_data: 'zone:alger_est_sud' }],
        ],
      };

      await sendTelegramMessage(
        chatId,
        `<b>مرحباً بك في تـويـزة | Welcome to Twiza Blood</b>\n\nTo receive emergency donation alerts near you, please select your primary zone in Algiers:`,
        keyboard
      );

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Button Callbacks
    if (update.callback_query) {
      const callbackQueryId = update.callback_query.id;
      const data = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;

      // Instantly acknowledge the button tap to stop the loading spinner
      await answerCallbackQuery(callbackQueryId);

      // --- Registration Flow: Zone Selection ---
      if (data.startsWith('zone:')) {
        const zone = data.split(':')[1];

        // Upsert donor with zone
        await supabaseAdmin.from('donors').upsert(
          {
            telegram_chat_id: chatId,
            zone: zone,
            wilaya_code: 16,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'telegram_chat_id' }
        );

        const bloodKeyboard = {
          inline_keyboard: [
            [{ text: 'A+', callback_data: 'blood:A+' }, { text: 'A-', callback_data: 'blood:A-' }],
            [{ text: 'B+', callback_data: 'blood:B+' }, { text: 'B-', callback_data: 'blood:B-' }],
            [{ text: 'O+', callback_data: 'blood:O+' }, { text: 'O-', callback_data: 'blood:O-' }],
            [{ text: 'AB+', callback_data: 'blood:AB+' }, { text: 'AB-', callback_data: 'blood:AB-' }],
          ],
        };

        await sendTelegramMessage(
          chatId,
          `✅ Zone saved!\n\nNow, select your <b>Blood Type</b>:`,
          bloodKeyboard
        );
      }

      // --- Registration Flow: Blood Type Selection ---
      if (data.startsWith('blood:')) {
        const bloodType = data.split(':')[1];

        await supabaseAdmin
          .from('donors')
          .update({
            blood_type: bloodType,
            updated_at: new Date().toISOString(),
          })
          .eq('telegram_chat_id', chatId);

        await sendTelegramMessage(
          chatId,
          `🩸 <b>Registration Complete! / اكتمل التسجيل</b>\n\nYou will now receive urgent alerts when hospitals in your zone require matching blood.`
        );
      }

      // --- Dispatch Flow: Donor Accepts Emergency Alert (Pledge) ---
      if (data.startsWith('pledge:')) {
        const ticketId = data.split(':')[1];

        const { data: donor } = await supabaseAdmin
          .from('donors')
          .select('id')
          .eq('telegram_chat_id', chatId)
          .single();

        if (donor) {
          const { error: pledgeError } = await supabaseAdmin.from('pledges').insert({
            ticket_id: ticketId,
            donor_id: donor.id,
            status: 'committed',
          });

          if (pledgeError) {
            await sendTelegramMessage(
              chatId,
              `⚠️ You have already responded or this emergency slot is full.`
            );
          } else {
            await sendTelegramMessage(
              chatId,
              `❤️ <b>Barak Allahu Feek! / شكراً لجهودك</b>\n\nYour commitment has been recorded. Please proceed to the Transfusion Center (CTS) at the hospital.\n\n<i>Note: You will receive an automated check-in in 45 minutes to confirm arrival.</i>`
            );
          }
        }
      }

      // --- Dispatch Flow: Donor Declines Emergency Alert ---
      if (data.startsWith('decline:')) {
        await sendTelegramMessage(
          chatId,
          `🤝 Thank you for letting us know! We will keep you available for future urgent appeals.`
        );
      }

      // --- Cron Check-In: Arrival Confirmation ---
      if (data.startsWith('arrived:')) {
        const pledgeId = data.split(':')[1];
        await supabaseAdmin
          .from('pledges')
          .update({ status: 'arrived' })
          .eq('id', pledgeId);

        await sendTelegramMessage(
          chatId,
          `🏥 <b>Arrival Confirmed!</b>\n\nThank you for reaching the Transfusion Center. May your donation save a life today!`
        );
      }

      // --- Cron Check-In: Delayed Response ---
      if (data.startsWith('delayed:')) {
        const pledgeId = data.split(':')[1];
        await supabaseAdmin
          .from('pledges')
          .update({ status: 'delayed' })
          .eq('id', pledgeId);

        await sendTelegramMessage(
          chatId,
          `🚗 <b>Understood!</b>\n\nWe reserved your slot for 15 additional minutes. Drive safely!`
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}