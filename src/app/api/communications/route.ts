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

  // Insert event log first
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
    // Get the token for the requested group
    let token: string | null = null;
    if (line_group_id) {
      const { data: grp } = await admin
        .from('line_groups')
        .select('notify_token')
        .eq('id', line_group_id)
        .single();
      token = grp?.notify_token ?? null;
    } else {
      token = process.env.LINE_NOTIFY_TOKEN ?? null;
    }

    if (token) {
      try {
        const res = await fetch('https://notify-api.line.me/api/notify', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ message: `\n${messageBody}` }),
        });
        status = res.ok ? 'sent' : 'failed';
        if (!res.ok) error = `LINE error ${res.status}`;
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
    }
  } else if (channel === 'email') {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'no-reply@example.com';

    if (apiKey && recipient) {
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
            text: messageBody,
          }),
        });
        status = res.ok ? 'sent' : 'failed';
        if (!res.ok) {
          const txt = await res.text();
          error = `Resend error ${res.status}: ${txt}`;
        }
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // Update event with final status
  await admin
    .from('communication_events')
    .update({ status, error })
    .eq('id', event.id);

  return NextResponse.json({ event: { ...event, status, error } });
}
