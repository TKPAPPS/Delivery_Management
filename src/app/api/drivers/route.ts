import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: drivers, error } = await ctx.supabase.from('drivers').select('*').order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drivers });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['admin', 'logistics'].includes(ctx.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { name, phone, vehicle_type, license_plate, notes } = parsed.data as {
    name: string; phone?: string; vehicle_type?: string; license_plate?: string; notes?: string;
  };
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: driver, error } = await admin
    .from('drivers')
    .insert({ name, phone: phone || null, vehicle_type: vehicle_type || null, license_plate: license_plate || null, notes: notes || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ driver }, { status: 201 });
}
