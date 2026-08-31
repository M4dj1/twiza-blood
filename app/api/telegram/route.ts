import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: object) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
  } catch (e) {
    console.error('sendTelegramMessage error:', e);
  }
}

async function answerCallbackQuery(callbackQueryId: string) {
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch (e) {
    console.error('answerCallbackQuery error:', e);
  }
}

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // 1. Direct Message (/start)
    if (update.message?.text === '/start') {
      const chatId = update.message.chat.id;

      const keyboard = {
        inline_keyboard: [
          [{ text: 'Alger Centre', callback_data: 'zone:alger_centre' }],
          [{ text: 'Alger Ouest', callback_data: 'zone:alger_ouest' }],
          [{ text: 'Alger Est & Sud', callback_data: 'zone:alger_est_sud' }],
        ],
      };

      await sendTelegramMessage(
        chatId,
        `<b>Welcome to Twiza Blood</b>\n\nSelect your primary zone:`,
        keyboard
      );
      return NextResponse.json({ ok: true });
    }

    // 2. Button Callbacks
    if (update.callback_query) {
      const callbackId = update.callback_query.id;
      const data = update.callback_query.data || '';
      const chatId = update.callback_query.message?.chat?.id || update.callback_query.from?.id;

      await answerCallbackQuery(callbackId);

      // --- Zone Selection ---
      if (data.startsWith('zone:')) {
        const zone = data.split(':')[1];

        // Save donor zone directly
        await supabaseAdmin.from('donors').upsert(
          {
            telegram_chat_id: chatId,
            zone: zone,
            wilaya_code: 16,
            is_active: true,
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

        await sendTelegramMessage(chatId, `✅ Zone saved! Select your <b>Blood Type</b>:`, bloodKeyboard);
      }

      // --- Blood Type Selection ---
      if (data.startsWith('blood:')) {
        const bloodType = data.split(':')[1];

        await supabaseAdmin
          .from('donors')
          .update({ blood_type: bloodType })
          .eq('telegram_chat_id', chatId);

        await sendTelegramMessage(
          chatId,
          `🩸 <b>Registration Complete!</b>\n\nYou will receive emergency alerts when matching requests arrive.`
        );
      }

      // --- Emergency Pledge ---
      if (data.startsWith('pledge:')) {
        const ticketId = data.split(':')[1];

        const { data: donor } = await supabaseAdmin
          .from('donors')
          .select('id')
          .eq('telegram_chat_id', chatId)
          .single();

        if (donor) {
          await supabaseAdmin.from('pledges').insert({
            ticket_id: ticketId,
            donor_id: donor.id,
            status: 'committed',
          });

          await sendTelegramMessage(chatId, `❤️ <b>Thank you!</b> Your pledge has been registered.`);
        }
      }

      // --- Emergency Decline ---
      if (data.startsWith('decline:')) {
        await sendTelegramMessage(chatId, `🤝 Thank you for letting us know!`);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to keep Telegram happy
  }
}