import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cardId = new URL(req.url).searchParams.get('card_id');
  if (!cardId) return NextResponse.json({ error: 'card_id required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('communication_events')
    .select('*')
    .eq('delivery_card_id', cardId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { channel, delivery_card_id, recipient, subject, body: messageBody, line_group_id } = parsed.data as {
    channel: string; delivery_card_id: string; recipient?: string;
    subject?: string; body?: string; line_group_id?: string;
  };

  if (!channel || !delivery_card_id) {
    return NextResponse.json({ error: 'channel and delivery_card_id are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: event, error: insertErr } = await admin
    .from('communication_events')
    .insert({
      delivery_card_id,
      channel,
      recipient,
      subject: subject || null,
      body: messageBody,
      status: 'skipped',
      sent_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !event) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to log event' }, { status: 500 });
  }

  let status: 'sent' | 'failed' | 'skipped' = 'skipped';
  let error: string | null = null;

  if (channel === 'line') {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    let targetId: string | null = null;

    if (line_group_id) {
      const { data: grp } = await admin
        .from('line_groups')
        .select('line_target_id')
        .eq('id', line_group_id)
        .single();
      targetId = (grp as { line_target_id: string | null } | null)?.line_target_id ?? null;
    } else {
      targetId = process.env.LINE_DEFAULT_TARGET_ID ?? null;
    }

    if (!token) {
      error = 'LINE_CHANNEL_ACCESS_TOKEN not configured';
      status = 'skipped';
    } else if (!targetId) {
      error = 'No LINE target ID configured for this group';
      status = 'skipped';
    } else {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: targetId,
            messages: [{ type: 'text', text: messageBody ?? '' }],
          }),
        });
        if (res.ok) {
          status = 'sent';
        } else {
          const body = await res.json().catch(() => ({})) as { message?: string };
          error = `LINE API error: ${res.status}${body.message ? ` — ${body.message}` : ''}`;
          status = 'failed';
        }
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
    }
  } else if (channel === 'email') {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey) {
      error = 'RESEND_API_KEY not configured';
      status = 'skipped';
    } else if (!fromEmail) {
      error = 'RESEND_FROM_EMAIL not configured';
      status = 'skipped';
    } else if (!recipient) {
      error = 'No recipient address provided';
      status = 'skipped';
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            subject: subject ?? 'Delivery Update',
            text: messageBody ?? '',
          }),
        });
        if (res.ok) {
          status = 'sent';
        } else {
          const txt = await res.text();
          error = `Resend error ${res.status}: ${txt}`;
          status = 'failed';
        }
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  await admin
    .from('communication_events')
    .update({ status, error })
    .eq('id', event.id);

  return NextResponse.json({ event: { ...event, status, error } });
}
