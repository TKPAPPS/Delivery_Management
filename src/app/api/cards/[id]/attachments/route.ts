import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200)
    || 'attachment';
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: attachments, error } = await admin
    .from('attachments')
    .select('*, uploader:profiles!attachments_uploaded_by_fkey(id, name, email)')
    .eq('delivery_card_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate 24-hour signed URLs for each attachment
  const enriched = await Promise.all(
    (attachments ?? []).map(async (att) => {
      const { data: signed } = await admin.storage
        .from('delivery-attachments')
        .createSignedUrl(att.storage_path, 86400);
      return { ...att, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ attachments: enriched });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 20 MB limit' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type "${file.type}" is not allowed. Allowed: images, PDF, Word, Excel, CSV, TXT.` },
      { status: 400 }
    );
  }

  const safeName = sanitizeFilename(file.name);
  const admin = createSupabaseAdminClient();
  const timestamp = Date.now();
  const storagePath = `${params.id}/${timestamp}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from('delivery-attachments')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: attachment, error: dbError } = await admin
    .from('attachments')
    .insert({
      delivery_card_id: params.id,
      file_name: safeName,
      file_url: storagePath,      // store storage_path here; signed URLs generated on read
      file_type: file.type,
      storage_path: storagePath,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (dbError) {
    // DB insert failed — clean up the uploaded file to avoid orphan
    await admin.storage.from('delivery-attachments').remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await logActivity(params.id, user.id, ACTIONS.ATTACHMENT_ADDED, { file_name: safeName });

  // Return with a signed URL so the client can display it immediately
  const { data: signed } = await admin.storage
    .from('delivery-attachments')
    .createSignedUrl(storagePath, 86400);

  return NextResponse.json(
    { attachment: { ...attachment, signed_url: signed?.signedUrl ?? null } },
    { status: 201 }
  );
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

  // Delete DB record first; if this fails we don't remove the file
  const { error: dbError } = await admin.from('attachments').delete().eq('id', attachmentId);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Remove from storage — best-effort; log if it fails but don't return error to client
  const { error: storageError } = await admin.storage
    .from('delivery-attachments')
    .remove([att.storage_path]);
  if (storageError) {
    console.error('[attachments] Storage removal failed for', att.storage_path, storageError.message);
  }

  await logActivity(params.id, user.id, ACTIONS.ATTACHMENT_REMOVED, { file_name: att.file_name });

  return NextResponse.json({ success: true });
}
