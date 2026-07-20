import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { moveSaleOrder } from '@/lib/customer-moves';

// Move a single sale order (one SO chip) off a shared delivery customer to another card.
// `id` is the customer_sale_orders chip id (same id space as DELETE /api/sale-orders/[id]).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as {
    action?: string;
    target_card_id?: string;
    new_destination?: string;
    reason?: string;
    notes?: string;
  };

  const admin = createSupabaseAdminClient();
  const result = await moveSaleOrder(admin, {
    saleOrderChipId: params.id,
    action: body.action ?? 'unload',
    targetCardId: body.target_card_id,
    newDestination: body.new_destination,
    reason: body.reason,
    notes: body.notes,
    userId: ctx.user.id,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, ...result });
}
