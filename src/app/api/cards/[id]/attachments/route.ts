import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: attachments, error } = await ctx.supabase
    .from('attachments')
    .select('*, uploader:profiles!attachments_uploaded_by_fkey(id, name, email)')
    .eq('delivery_card_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const timestamp = Date.now();
  const storagePath = `${params.id}/${timestamp}-${file.name}`;

  const { error: uploadError } = await admin.storage
    .from('delivery-attachments')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = admin.storage.from('delivery-attachments').getPublicUrl(storagePath);

  const { data: attachment, error } = await admin
    .from('attachments')
    .insert({
      delivery_card_id: params.id,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type,
      storage_path: storagePath,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(params.id, user.id, ACTIONS.ATTACHMENT_ADDED, { file_name: file.name });

  return NextResponse.json({ attachment }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const { searchParams } = new URL(req.url);
  const attachmentId = searchParams.get('id');
  if (!attachmentId) return NextResponse.json({ error: 'Attachment ID required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: att } = await admin.from('attachments').select('*').eq('id', attachmentId).single();
  if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await admin.storage.from('delivery-attachments').remove([att.storage_path]);

  const { error } = await admin.from('attachments').delete().eq('id', attachmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(params.id, user.id, ACTIONS.ATTACHMENT_REMOVED, { file_name: att.file_name });

  return NextResponse.json({ success: true });
}
