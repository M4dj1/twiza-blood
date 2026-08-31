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

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    // 1. Handle /start
    if (update.message?.text?.startsWith('/start')) {
      const chatId = update.message.chat.id;

      const { data: wilayas } = await supabaseAdmin
        .from('wilayas')
        .select('*')
        .order('id', { ascending: true });

      const inline_keyboard = (wilayas || []).map((w) => [
        { text: `${w.id} - ${w.name} (${w.name_ar})`, callback_data: `wilaya:${w.id}` },
      ]);

      await sendMsg(
        chatId,
        '🩸 <b>مرحبًا بك في منصة تـويـزة للتبرع بالدم</b>\n\nيرجى اختيار الولاية الخاصة بك لتلقي نداءات الاستغاثة القريبة منك:',
        { inline_keyboard }
      );

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Button Callbacks
    if (update.callback_query) {
      const callbackId = update.callback_query.id;
      const callbackData = update.callback_query.data || '';
      const chatId = update.callback_query.message?.chat.id || update.callback_query.from.id;

      const [action, value] = callbackData.split(':');

      if (action === 'wilaya') {
        const wilayaId = parseInt(value, 10);

        // Save selected wilaya and reset subsequent steps
        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, wilaya_id: wilayaId, zone_id: null, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId);

        // If Algiers (16), prompt for Zone
        if (wilayaId === 16) {
          const { data: zones } = await supabaseAdmin
            .from('zones')
            .select('*')
            .eq('wilaya_id', 16);

          const inline_keyboard = (zones || []).map((z) => [
            { text: `${z.name} (${z.name_ar})`, callback_data: `zone:${z.id}` },
          ]);

          await sendMsg(chatId, '📍 <b>اختر المنطقة التابعة للجزائر العاصمة:</b>', {
            inline_keyboard,
          });
        } else {
          // Other wilayas skip zone selection -> Blood Type selection directly
          await showBloodTypeKeyboard(chatId);
        }
      }

      if (action === 'zone') {
        const zoneId = parseInt(value, 10);

        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, zone_id: zoneId, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId);
        await showBloodTypeKeyboard(chatId);
      }

      if (action === 'blood') {
        const bloodType = value;

        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, blood_type: bloodType, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId, '✅ تم الحفظ');

        await sendMsg(
          chatId,
          `✅ <b>تم تسجيلك بنجاح في منصة تـويـزة!</b>\n\n🩸 <b>فصيلة الدم:</b> ${bloodType}\n\nستصلك إشعارات فورية عند وجود حاجة ماسة لدم من فصيلتك في منطقتك. يمكنك تعديل معلوماتك في أي وقت بإرسال /start.`
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ ok: true }); // Acknowledge to prevent Telegram retry spam
  }
}

async function showBloodTypeKeyboard(chatId: number) {
  const keyboard = [
    [
      { text: 'O+', callback_data: 'blood:O+' },
      { text: 'O-', callback_data: 'blood:O-' },
    ],
    [
      { text: 'A+', callback_data: 'blood:A+' },
      { text: 'A-', callback_data: 'blood:A-' },
    ],
    [
      { text: 'B+', callback_data: 'blood:B+' },
      { text: 'B-', callback_data: 'blood:B-' },
    ],
    [
      { text: 'AB+', callback_data: 'blood:AB+' },
      { text: 'AB-', callback_data: 'blood:AB-' },
    ],
  ];

  await sendMsg(chatId, '🩸 <b>اختر فصيلة الدم الخاصة بك:</b>', {
    inline_keyboard: keyboard,
  });
}