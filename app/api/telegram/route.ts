import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const ZONES: Record<string, string> = {
  alger_centre: 'Alger Centre',
  alger_ouest: 'Alger Ouest',
  alger_est_sud: 'Alger Est & Sud',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const zoneKeyboard = {
  inline_keyboard: Object.entries(ZONES).map(([slug, label]) => [
    { text: label, callback_data: `zone:${slug}` },
  ]),
};

const bloodKeyboard = {
  inline_keyboard: [
    [{ text: 'A+', callback_data: 'blood:A+' }, { text: 'A-', callback_data: 'blood:A-' }],
    [{ text: 'B+', callback_data: 'blood:B+' }, { text: 'B-', callback_data: 'blood:B-' }],
    [{ text: 'O+', callback_data: 'blood:O+' }, { text: 'O-', callback_data: 'blood:O-' }],
    [{ text: 'AB+', callback_data: 'blood:AB+' }, { text: 'AB-', callback_data: 'blood:AB-' }],
  ],
};

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tg(method: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) console.error(`Telegram ${method} failed:`, data);
    return data;
  } catch (err) {
    console.error(`Telegram ${method} network error:`, err);
    return null;
  }
}

const sendMessage = (chatId: number, text: string, replyMarkup?: object) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup });

const answerCallback = (callbackQueryId: string, text: string) =>
  tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text });

export async function POST(req: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!secret) console.warn('TELEGRAM_WEBHOOK_SECRET not set — webhook is unauthenticated');

    const update = await req.json();

    // ---------- /start ----------
    if (update.message?.text?.startsWith('/start')) {
      const chatId: number = update.message.chat.id;
      await sendMessage(
        chatId,
        '<b>Welcome to Twiza Blood 🩸</b>\n\nYou will receive emergency donation alerts for your zone.\n\nSelect your primary zone:',
        zoneKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    // ---------- inline button callbacks ----------
    if (update.callback_query) {
      const callbackId: string = update.callback_query.id;
      const data: string = update.callback_query.data ?? '';
      const from = update.callback_query.from ?? {};
      const chatId: number | undefined = update.callback_query.message?.chat?.id ?? from.id;
      if (!chatId) return NextResponse.json({ ok: true });

      const [action, value] = data.split(':');

      switch (action) {
        case 'zone': {
          const zone = value && ZONES[value] ? value : null;
          if (!zone) { await answerCallback(callbackId, 'Unknown zone'); break; }

          const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ') || null;
          const { error } = await supabaseAdmin.from('donors').upsert(
            {
              telegram_chat_id: chatId,
              telegram_user_id: from.id ?? chatId,
              full_name: fullName,
              username: from.username ?? null,
              zone,
              wilaya_code: 16,
              is_active: true,
            },
            { onConflict: 'telegram_chat_id' }
          );

          if (error) {
            console.error('Donor zone upsert failed:', error);
            await answerCallback(callbackId, '⚠️ Save failed — please try again');
            break;
          }
          await answerCallback(callbackId, `✅ ${ZONES[zone]}`);
          await sendMessage(
            chatId,
            `✅ Zone <b>${ZONES[zone]}</b> saved!\n\nNow select your <b>blood type</b>:`,
            bloodKeyboard
          );
          break;
        }

        case 'blood': {
          const bloodType = value ?? '';
          if (!BLOOD_TYPES.includes(bloodType)) {
            await answerCallback(callbackId, 'Unknown blood type');
            break;
          }

          // Upsert (merge): works whether or not the zone step already created the row.
          const { error } = await supabaseAdmin.from('donors').upsert(
            { telegram_chat_id: chatId, blood_type: bloodType, is_active: true },
            { onConflict: 'telegram_chat_id' }
          );
          if (error) {
            console.error('Donor blood_type upsert failed:', error);
            await answerCallback(callbackId, '⚠️ Save failed — please try again');
            break;
          }

          const { data: donor } = await supabaseAdmin
            .from('donors')
            .select('zone')
            .eq('telegram_chat_id', chatId)
            .maybeSingle();

          if (!donor?.zone) {
            await answerCallback(callbackId, `✅ ${bloodType} saved`);
            await sendMessage(chatId, 'One last step — select your <b>zone</b>:', zoneKeyboard);
            break;
          }

          await answerCallback(callbackId, '✅ Registered');
          await sendMessage(
            chatId,
            `🩸 <b>Registration complete!</b>\n\nZone: <b>${esc(ZONES[donor.zone] ?? donor.zone)}</b>\nBlood type: <b>${bloodType}</b>\n\nYou will receive emergency alerts for <b>${bloodType}</b> in your zone. Send /start anytime to update.`
          );
          break;
        }

        case 'pledge': {
          const { data: donor, error: donorError } = await supabaseAdmin
            .from('donors')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .maybeSingle();

          if (donorError || !donor) {
            console.error('Pledge donor lookup failed:', donorError);
            await answerCallback(callbackId, '⚠️ Please register first: /start');
            break;
          }

          const { error } = await supabaseAdmin.from('pledges').upsert(
            { ticket_id: Number(value), donor_id: donor.id, status: 'committed' },
            { onConflict: 'ticket_id,donor_id' }
          );
          if (error) {
            console.error('Pledge upsert failed:', error);
            await answerCallback(callbackId, '⚠️ Failed — please try again');
            break;
          }

          await answerCallback(callbackId, '❤️ Pledge registered');
          await sendMessage(
            chatId,
            '❤️ <b>Thank you!</b> Your pledge has been registered. Please head to the collection site — the team is expecting you.'
          );
          break;
        }

        case 'decline': {
          await answerCallback(callbackId, 'Noted — thank you');
          break;
        }

        case 'arrived':
        case 'delayed': {
          const status = action === 'arrived' ? 'arrived' : 'delayed';
          const { error } = await supabaseAdmin
            .from('pledges')
            .update({ status })
            .eq('id', Number(value));
          if (error) console.error(`Pledge ${action} update failed:`, error);
          await answerCallback(
            callbackId,
            error
              ? '⚠️ Failed — please try again'
              : action === 'arrived'
                ? '🏥 Arrival confirmed'
                : '⏱️ Noted — 15 more minutes'
          );
          break;
        }

        default:
          await answerCallback(callbackId, 'Unknown action');
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    // Always 200 so Telegram doesn't retry and double-process (our upserts are idempotent anyway).
    return NextResponse.json({ ok: true });
  }
}