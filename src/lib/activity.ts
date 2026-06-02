import { createSupabaseAdminClient } from './supabase-server';

export async function logActivity(
  deliveryCardId: string | null,
  userId: string | null,
  action: string,
  metadata?: Record<string, unknown>,
  options?: { entity_type?: string; entity_id?: string }
) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from('activity_log').insert({
      delivery_card_id: deliveryCardId,
      user_id: userId,
      action,
      metadata: metadata ?? null,
      entity_type: options?.entity_type ?? null,
      entity_id: options?.entity_id ?? null,
    });
  } catch (err) {
    // Never throw — log errors silently
    console.error('Activity log error:', err);
  }
}

// Common action constants
export const ACTIONS = {
  // Delivery card actions (legacy)
  CARD_CREATED: 'card_created',
  STATUS_CHANGED: 'status_changed',
  PRIORITY_CHANGED: 'priority_changed',
  CUSTOMER_ADDED: 'customer_added',
  CUSTOMER_REMOVED: 'customer_removed',
  CUSTOMER_UNLOADED: 'customer_unloaded',
  CUSTOMER_MOVED: 'customer_moved',
  DRIVER_UPDATED: 'driver_updated',
  ATTACHMENT_ADDED: 'attachment_added',
  ATTACHMENT_REMOVED: 'attachment_removed',
  PARTIAL_SHIPMENT_MARKED: 'partial_shipment_marked',
  COMMENT_ADDED: 'comment_added',
  CARD_ARCHIVED: 'card_archived',
  CARD_UPDATED: 'card_updated',
  CARD_DELETED: 'card_deleted',
  CARD_RESTORED: 'card_restored',
  SALE_ORDER_ADDED: 'sale_order_added',
  SALE_ORDER_REMOVED: 'sale_order_removed',
  EXTRA_ITEM_ADDED: 'extra_item_added',
  EXTRA_ITEM_REMOVED: 'extra_item_removed',
  // Order actions (ops platform)
  ORDER_CREATED: 'order_created',
  ORDER_UPDATED: 'order_updated',
  ORDER_DELETED: 'order_deleted',
  ORDER_LINE_ADDED: 'order_line_added',
  ORDER_LINE_UPDATED: 'order_line_updated',
  ORDER_LINE_DELETED: 'order_line_deleted',
  ORDER_ASSIGNED: 'order_assigned',
  DELIVERY_CREATED_FROM_ORDERS: 'delivery_created_from_orders',
} as const;
