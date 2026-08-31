import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

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
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;

      // Stage 1: Zone Selected -> Ask for Blood Type
      if (data.startsWith('zone:')) {
        const selectedZone = data.split(':')[1];
        
        const bloodKeyboard = {
          inline_keyboard: [
            [{ text: 'A+', callback_data: `reg:${selectedZone}:A+` }, { text: 'A-', callback_data: `reg:${selectedZone}:A-` }],
            [{ text: 'B+', callback_data: `reg:${selectedZone}:B+` }, { text: 'B-', callback_data: `reg:${selectedZone}:B-` }],
            [{ text: 'AB+', callback_data: `reg:${selectedZone}:AB+` }, { text: 'AB-', callback_data: `reg:${selectedZone}:AB-` }],
            [{ text: 'O+', callback_data: `reg:${selectedZone}:O+` }, { text: 'O-', callback_data: `reg:${selectedZone}:O-` }],
          ],
        };

        await sendTelegramMessage(chatId, `Select your blood type:`, bloodKeyboard);
      }

      // Stage 2: Save Registration to Supabase
      if (data.startsWith('reg:')) {
        const [, zone, bloodType] = data.split(':');

        const { error } = await supabaseAdmin.from('donors').upsert(
          {
            telegram_chat_id: chatId,
            zone,
            blood_type: bloodType,
            is_active: true,
          },
          { onConflict: 'telegram_chat_id' }
        );

        if (error) {
          await sendTelegramMessage(chatId, `⚠️ Registration failed. Please try again with /start.`);
        } else {
          await sendTelegramMessage(
            chatId,
            `✅ *Registration Complete!*\n\n• Zone: *${zone}*\n• Blood Type: *${bloodType}*\n\nYou will now receive targeted alerts when a matching hospital emergency occurs in your area.`
          );
        }
      }

      // Stage 3: Donor Accepts Emergency Alert (Pledge)
        if (data.startsWith('pledge:')) {
        const ticketId = data.split(':')[1];

        // 1. Fetch donor ID
        const { data: donor } = await supabaseAdmin
            .from('donors')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();

        if (donor) {
            // 2. Insert Pledge Commitment
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
                `❤️ *Barak Allahu Feek! / شكراً لجهودك*\n\nYour commitment has been recorded. Please proceed to the Transfusion Center (CTS) at the hospital.\n\n_Note: You will receive a automated check-in in 45 minutes to confirm arrival._`
            );
            }
        }
        }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}