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
    const update = await req.json();

    // Handle /start Command
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
        `*مرحباً بك في تـويـزة | Welcome to Twiza Blood*\n\nTo receive emergency donation alerts near you, please select your primary zone in Algiers:`,
        keyboard
      );

      return NextResponse.json({ ok: true });
    }

    // Handle Button Callbacks (Zone & Blood Type Selection)
    if (update.callback_query) {
    const callbackQueryId = update.callback_query.id;
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;

    // 1. Instantly acknowledge the button tap to stop the loading spinner
    await answerCallbackQuery(callbackQueryId);

    // Stage 3a: Donor Accepts Emergency Alert (Pledge)
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
            await sendTelegramMessage(chatId, `⚠️ You have already responded or this emergency slot is full.`);
        } else {
            await sendTelegramMessage(
            chatId,
            `❤️ <b>Barak Allahu Feek! / شكراً لجهودك</b>\n\nYour commitment has been recorded. Please proceed to the Transfusion Center (CTS) at the hospital.\n\n<i>Note: You will receive an automated check-in in 45 minutes to confirm arrival.</i>`
            );
        }
        }
    }

    // Stage 3b: Donor Declines Emergency Alert
    if (data.startsWith('decline:')) {
        await sendTelegramMessage(
        chatId,
        `🤝 Thank you for letting us know! We will keep you available for future urgent appeals.`
        );
    }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}