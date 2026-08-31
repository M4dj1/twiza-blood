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

const editMessage = (chatId: number, messageId: number, text: string, replyMarkup?: object) =>
  sendTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup || { inline_keyboard: [] },
  });

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
        { text: `${w.id} - ${w.name} (${w.name_ar})`, callback_data: `wilaya:${w.id}` },
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

      const [action, value] = callbackData.split(':');

      // --- Registration: Wilaya ---
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
            { text: `${z.name} (${z.name_ar})`, callback_data: `zone:${z.id}` },
          ]);

          if (messageId && chatId) {
            await editMessage(
              chatId,
              messageId,
              '📍 <b>اختر المنطقة التابعة للجزائر العاصمة:</b>',
              { inline_keyboard }
            );
          }
        } else {
          await promptBloodType(chatId, messageId);
        }
      }

      // --- Registration: Zone ---
      if (action === 'zone') {
        const zoneId = parseInt(value, 10);

        await supabaseAdmin.from('donors').upsert(
          { chat_id: chatId, zone_id: zoneId, is_active: true },
          { onConflict: 'chat_id' }
        );

        await answerCallback(callbackId);
        await promptBloodType(chatId, messageId);
      }

      // --- Registration: Blood Type ---
      if (action === 'blood') {
        const bloodType = value;

        if (BLOOD_TYPES.includes(bloodType)) {
          await supabaseAdmin.from('donors').upsert(
            { chat_id: chatId, blood_type: bloodType, is_active: true },
            { onConflict: 'chat_id' }
          );

          await answerCallback(callbackId, '✅ تم حفظ البيانات');

          const { data: donor } = await supabaseAdmin
            .from('donors')
            .select('wilayas(name_ar), zones(name_ar)')
            .eq('chat_id', chatId)
            .maybeSingle();

          const wilayaName = (donor as any)?.wilayas?.name_ar || 'الجزائر';
          const zoneName = (donor as any)?.zones?.name_ar ? ` - ${(donor as any)?.zones?.name_ar}` : '';

          if (messageId && chatId) {
            await editMessage(
              chatId,
              messageId,
              `🩸 <b>بطاقة متبرع | Twiza Blood</b>\n\n` +
              `👤 <b>الحالة:</b> متبرع نشط ومستعد\n` +
              `📍 <b>المنطقة:</b> ${wilayaName}${zoneName}\n` +
              `🩸 <b>فصيلة الدم:</b> <b>${bloodType}</b>\n\n` +
              `<i>ستصلك تنبيهات فورية عند وجود نداءات طارئة في منطقتك.</i>`
            );
          }
        }
      }

      // --- Dispatch: Pledge (Accept) using ticket_id ---
      if (action === 'pledge') {
        const ticketId = value;

        // 1. Get donor ID from Supabase
        const { data: donor } = await supabaseAdmin
          .from('donors')
          .select('id')
          .eq('chat_id', chatId)
          .single();

        if (!donor) {
          await answerCallback(callbackId, 'يرجى التسجيل أولاً عبر إرسال /start');
          return NextResponse.json({ ok: true });
        }

        // 2. Check Emergency status & capacity
        const { data: emergency } = await supabaseAdmin
          .from('emergencies')
          .select('id, hospital_name, units_needed, pledges_count, status')
          .eq('id', ticketId)
          .single();

        if (!emergency || emergency.status === 'fulfilled' || emergency.status === 'closed') {
          await answerCallback(callbackId, 'تم توفير العدد المطلوب لهذه الحالة');
          if (messageId && chatId) {
            await editMessage(
              chatId,
              messageId,
              `ℹ️ <b>اكتمل النداء</b>\n\n` +
              `تم تغطية الاحتياج وتأكيد متبرعين لهذه الحالة مسبقًا. بارك الله فيك!`
            );
          }
          return NextResponse.json({ ok: true });
        }

        // 3. Upsert Pledge using ticket_id
        const { error: pledgeError } = await supabaseAdmin
          .from('pledges')
          .upsert(
            { ticket_id: ticketId, donor_id: donor.id, status: 'committed' },
            { onConflict: 'ticket_id,donor_id' }
          );

        if (pledgeError) {
          console.error('Pledge error:', pledgeError);
          await answerCallback(callbackId, 'تعذر التسجيل، يرجى المحاولة لاحقاً');
          return NextResponse.json({ ok: true });
        }

        // 4. Update Emergency Count
        const newCount = (emergency.pledges_count || 0) + 1;
        const isFulfilled = newCount >= emergency.units_needed;

        await supabaseAdmin
          .from('emergencies')
          .update({
            pledges_count: newCount,
            status: isFulfilled ? 'fulfilled' : 'open',
          })
          .eq('id', ticketId);

        await answerCallback(callbackId, '❤️ جزاك الله خيراً');

        // Render confirmation card with an active cancel button
        if (messageId && chatId) {
          const cancelKeyboard = {
            inline_keyboard: [
              [{ text: '⚠️ إلغاء الاستجابة / اعتذار طارئ', callback_data: `cancel_pledge:${ticketId}` }],
            ],
          };

          await editMessage(
            chatId,
            messageId,
            `✅ <b>تم تأكيد استجابتك للتبرع</b>\n\n` +
            `🏥 <b>الوجهة:</b> ${emergency.hospital_name}\n` +
            `📍 يرجى التوجه إلى مصلحة حقن الدم (CTS).\n\n` +
            `❤️ <i>إذا طرأ أي مانع يمنعك من الحضور، يرجى الضغط على زر الإلغاء أسفله حتى نتمكن من تنبيه متبرع آخر.</i>`,
            cancelKeyboard
          );
        }
      }

      // --- Dispatch: Cancel an existing pledge using ticket_id ---
      if (action === 'cancel_pledge') {
        const ticketId = value;

        const { data: donor } = await supabaseAdmin
          .from('donors')
          .select('id')
          .eq('chat_id', chatId)
          .single();

        if (donor) {
          // 1. Mark pledge as cancelled
          await supabaseAdmin
            .from('pledges')
            .update({ status: 'cancelled' })
            .eq('ticket_id', ticketId)
            .eq('donor_id', donor.id);

          // 2. Decrement emergency pledge count and reopen if needed
          const { data: emergency } = await supabaseAdmin
            .from('emergencies')
            .select('pledges_count, status')
            .eq('id', ticketId)
            .single();

          if (emergency) {
            const updatedCount = Math.max(0, (emergency.pledges_count || 1) - 1);
            await supabaseAdmin
              .from('emergencies')
              .update({
                pledges_count: updatedCount,
                status: 'open',
              })
              .eq('id', ticketId);
          }
        }

        await answerCallback(callbackId, 'تم إلغاء الاستجابة');

        if (messageId && chatId) {
          await editMessage(
            chatId,
            messageId,
            `⚠️ <b>تم إلغاء استجابتك</b>\n\n` +
            `تم تسجيل اعتذارك وإعادة فتح النداء لمتبرعين آخرين. نأمل مشاركتك معنا في المرات القادمة.`
          );
        }
      }

      // --- Dispatch: Decline ---
      if (action === 'decline') {
        await answerCallback(callbackId, 'شكراً لك');

        if (messageId && chatId) {
          await editMessage(
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

async function promptBloodType(chatId: number, messageId?: number) {
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

  const text = '🩸 <b>اختر فصيلة دمك:</b>';

  if (messageId) {
    await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
  } else {
    await sendMsg(chatId, text, { inline_keyboard: keyboard });
  }
}