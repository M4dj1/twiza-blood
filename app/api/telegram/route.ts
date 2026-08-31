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

  await sendMsg(
    chatId,
    `🩸 <b>تحديد فصيلة الدم</b>\n━━━━━━━━━━━━━━━━━━\nيرجى اختيار فصيلة دمك من القائمة أدناه:`,
    { inline_keyboard: keyboard }
  );
}

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    // 1. Command: /start
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
        `🩸 <b>منصة تـويـزة للتبرع بالدم | Twiza Blood</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `مرحبًا بك! هذه المنصة تربط المتبرعين بالدم مباشرة بحالات الطوارئ في الجزائر بدون أي وساطة.\n\n` +
        `📍 <b>الخطوة 1/2:</b> اختر ولايتك لتلقي النداءات القريبة منك:`,
        { inline_keyboard }
      );

      return NextResponse.json({ ok: true });
    }

    // 2. Callback Queries
    if (update.callback_query) {
      const callbackId = update.callback_query.id;
      const callbackData = update.callback_query.data || '';
      const chatId = update.callback_query.message?.chat.id || update.callback_query.from.id;
      const messageId = update.callback_query.message?.message_id;

      const [action, value] = callbackData.split(':');

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
            { text: `🏢 ${z.name} (${z.name_ar})`, callback_data: `zone:${z.id}` },
          ]);

          await sendMsg(
            chatId,
            `📍 <b>تحديد المنطقة - الجزائر العاصمة</b>\n━━━━━━━━━━━━━━━━━━\nاختر المنطقة الجغرافية الأقرب إليك:`,
            { inline_keyboard }
          );
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

      // Blood Type Selection
      if (action === 'blood') {
        const bloodType = value;

        if (BLOOD_TYPES.includes(bloodType)) {
          await supabaseAdmin.from('donors').upsert(
            { chat_id: chatId, blood_type: bloodType, is_active: true },
            { onConflict: 'chat_id' }
          );

          await answerCallback(callbackId, '✅ تم الحفظ بنجاح');

          await sendMsg(
            chatId,
            `✅ <b>اكتمل التسجيل بنجاح</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `🩸 <b>فصيلة الدم المسجلة :</b> <code>${bloodType}</code>\n` +
            `🔔 <b>حالة الحساب :</b> نشط ومستعد لتلقي الإشعارات\n\n` +
            `<i>ستصلك إشعارات فورية عند وجود حاجة ماسة لدم من فصيلتك. لتعديل بياناتك في أي وقت، أرسل /start.</i>`
          );
        }
      }

      // Donor Action: Accept / Pledge
      if (action === 'pledge') {
        await answerCallback(callbackId, '❤️ جزاك الله خيراً');

        if (messageId && chatId) {
          await editMessageText(
            chatId,
            messageId,
            `🚨 <b>نداء استغاثة عاجل للتبرع بالدم</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ <b>الحالة : تم تأكيد الاستجابة من طرفك</b>\n` +
            `<i>أنت في طريقك إلى المستشفى لإنقاذ حياة. شكرًا لك!</i>`
          );
        }

        await sendMsg(
          chatId,
          `❤️ <b>شكرًا لاستجابتك النبيلة</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `🏥 <b>الخطوات القادمة :</b>\n` +
          `1. توجه فورًا إلى <b>مصلحة حقن الدم (CTS)</b> بالمستشفى المذكور.\n` +
          `2. أخبر مكتب الاستقبال أنك قادم استجابةً لنداء الطوارئ.\n` +
          `3. احرص على شرب الماء وأخذ قسط من الراحة بعد التبرع.\n\n` +
          `<i>بارك الله فيك وجعلها في ميزان حسناتك.</i>`
        );
      }

      // Donor Action: Decline
      if (action === 'decline') {
        await answerCallback(callbackId, 'شكراً لك');

        if (messageId && chatId) {
          await editMessageText(
            chatId,
            messageId,
            `🚨 <b>نداء استغاثة عاجل للتبرع بالدم</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `❌ <b>الحالة : تم الاعتذار</b>\n` +
            `<i>نأمل أن تكون قادرًا على المساعدة في نداءات قادمة.</i>`
          );
        }

        await sendMsg(
          chatId,
          `🙏 <b>تم تسجيل اعتذارك</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `نقدّر وقتك، وسنقوم بإشعارك عند وجود أي نداء طارئ آخر في منطقتك.`
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram Webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}