import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TelegramUpdate } from '@/types';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

async function sendTelegram(method: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (error) {
    console.error(`Telegram API error (${method}):`, error);
    return null;
  }
}

const sendMsg = (chatId: number, text: string, replyMarkup?: object) =>
  sendTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });

const answerCallback = (callbackQueryId: string, text?: string) =>
  sendTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });

const editMessageText = (chatId: number, messageId: number, text: string) =>
  sendTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });

async function showBloodTypeKeyboard(chatId: number) {
  const keyboard = [
    [
      { text: '🩸 O+', callback_data: 'blood:O+' },
      { text: '🩸 O-', callback_data: 'blood:O-' },
    ],
    [
      { text: '🩸 A+', callback_data: 'blood:A+' },
      { text: '🩸 A-', callback_data: 'blood:A-' },
    ],
    [
      { text: '🩸 B+', callback_data: 'blood:B+' },
      { text: '🩸 B-', callback_data: 'blood:B-' },
    ],
    [
      { text: '🩸 AB+', callback_data: 'blood:AB+' },
      { text: '🩸 AB-', callback_data: 'blood:AB-' },
    ],
  ];

  await sendMsg(chatId, '🩸 <b>اختر فصيلة دمك:</b>', {
    inline_keyboard: keyboard,
  });
}

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    // 1. /start command
    if (update.message?.text?.startsWith('/start')) {
      const chatId = update.message.chat.id;

      const { data: wilayas } = await supabaseAdmin
        .from('wilayas')
        .select('*')
        .order('id', { ascending: true });

      const inline_keyboard = (wilayas || []).map((w) => [
        { text: `📍 ${w.id} - ${w.name} (${w.name_ar})`, callback_data: `wilaya:${w.id}` },
      ]);

      await sendMsg(
        chatId,
        '🩸 <b>منصة تـويـزة للتبرع بالدم</b>\n\nاختر ولايتك لتلقي نداءات الاستغاثة القريبة منك:',
        { inline_keyboard }
      );

      return NextResponse.json({ ok: true });
    }

    // 2. Button Callbacks
    if (update.callback_query) {
      const callbackId = update.callback_query.id;
      const callbackData = update.callback_query.data || '';
      const chatId = update.callback_query.message?.chat.id || update.callback_query.from.id;
      const messageId = update.callback_query.message?.message_id;

      const [action, value, extra] = callbackData.split(':');

      // Wilaya Selection
      if (action === 'wilaya') {
        const wilayaId = parseInt(value, 10);

        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, wilaya_id: wilayaId, zone_id: null, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId);

        if (wilayaId === 16) {
          const { data: zones } = await supabaseAdmin
            .from('zones')
            .select('*')
            .eq('wilaya_id', 16);

          const inline_keyboard = (zones || []).map((z) => [
            { text: `📍 ${z.name} (${z.name_ar})`, callback_data: `zone:${z.id}` },
          ]);

          await sendMsg(chatId, '📍 <b>اختر المنطقة التابعة للجزائر العاصمة:</b>', {
            inline_keyboard,
          });
        } else {
          await showBloodTypeKeyboard(chatId);
        }
      }

      // Zone Selection
      if (action === 'zone') {
        const zoneId = parseInt(value, 10);

        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, zone_id: zoneId, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId);
        await showBloodTypeKeyboard(chatId);
      }

      // Blood Selection
      if (action === 'blood') {
        const bloodType = value;

        if (BLOOD_TYPES.includes(bloodType)) {
          await supabaseAdmin.from('donors').upsert(
            { chat_id: chatId, blood_type: bloodType, is_active: true },
            { onConflict: 'chat_id' }
          );

          await answerCallback(callbackId, '✅ تم الحفظ');

          await sendMsg(
            chatId,
            `✅ <b>تم تسجيلك بنجاح!</b>\n\n` +
            `🩸 <b>فصيلة الدم:</b> ${bloodType}\n` +
            `🔔 ستصلك تنبيهات فورية عند وجود نداءات طارئة في منطقتك.`
          );
        }
      }

      // Donor Confirms (Pledge) -> Single In-Place Card Update
      if (action === 'pledge') {
        const hospital = extra ? decodeURIComponent(extra) : 'المستشفى';
        await answerCallback(callbackId, '❤️ جزاك الله خيراً');

        if (messageId && chatId) {
          await editMessageText(
            chatId,
            messageId,
            `✅ <b>تم تأكيد استجابتك للتبرع</b>\n\n` +
            `🏥 <b>الوجهة:</b> ${hospital}\n` +
            `📍 يرجى التوجه إلى مصلحة حقن الدم (CTS).\n\n` +
            `❤️ <i>بارك الله فيك وجعلها في ميزان حسناتك.</i>`
          );
        }
      }

      // Donor Declines -> Single In-Place Card Update
      if (action === 'decline') {
        await answerCallback(callbackId, 'شكراً لك');

        if (messageId && chatId) {
          await editMessageText(
            chatId,
            messageId,
            `❌ <b>تم الاعتذار عن هذا النداء</b>\n\n` +
            `نقدّر وقتك، وسنقوم بإشعارك عند وجود نداءات طارئة أخرى.`
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram Webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}