export type UserRole = 'admin' | 'sales' | 'stock_manager' | 'logistics';
export type DeliveryStatus = 'draft' | 'pending_booking' | 'booked' | 'in_transit' | 'delivered';
export type DeliveryPriority = 'normal' | 'urgent';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Destination {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerDirectory {
  id: string;
  name: string;
  contact_number: string | null;
  full_address: string | null;
  default_delivery_location: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicle_type: string | null;
  license_plate: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryCard {
  id: string;
  delivery_ref: string;
  destination: string;
  planned_date: string | null;
  status: DeliveryStatus;
  status_changed_at: string;
  priority: DeliveryPriority;
  internal_notes: string | null;
  delivery_notes: string | null;
  driver_id: string | null;
  driver_name_manual: string | null;
  driver_phone_manual: string | null;
  vehicle_type_manual: string | null;
  license_plate_manual: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  archived_at: string | null;
  delivered_at: string | null;
}

export interface DeliveryCustomer {
  id: string;
  delivery_card_id: string;
  customer_name: string;
  delivery_location: string | null;
  notes: string | null;
  partial_shipment: boolean;
  partial_shipment_note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerSaleOrder {
  id: string;
  delivery_customer_id: string;
  sale_order_number: string;
  notes: string | null;
  created_at: string;
}

export interface ExtraDeliveryItem {
  id: string;
  delivery_customer_id: string;
  item_name: string;
  quantity: string | null;
  notes: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  delivery_card_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
}

export interface Comment {
  id: string;
  delivery_card_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  delivery_card_id: string | null;
  user_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationEvent {
  id: string;
  type: string;
  delivery_card_id: string | null;
  payload: Record<string, unknown> | null;
  status: NotificationStatus;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface PlanningQueueItem {
  id: string;
  customer_name: string;
  destination: string | null;
  delivery_location: string | null;
  sale_order_refs: string[];
  extra_items: Array<{ item_name: string; quantity?: string }>;
  notes: string | null;
  reason: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

// App-level composite types
export interface CustomerWithRelations extends DeliveryCustomer {
  sale_orders: CustomerSaleOrder[];
  extra_items: ExtraDeliveryItem[];
}

export interface DeliveryCardWithCustomers extends DeliveryCard {
  customers: CustomerWithRelations[];
  driver: Driver | null;
  creator: Pick<Profile, 'id' | 'name' | 'email'> | null;
  _count?: {
    comments: number;
    attachments: number;
  };
}

export interface DeliveryCardFull extends DeliveryCardWithCustomers {
  comments: Array<Comment & { profile: Pick<Profile, 'id' | 'name' | 'email'> | null }>;
  attachments: Array<Attachment & { uploader: Pick<Profile, 'id' | 'name' | 'email'> | null }>;
  activity_log: Array<ActivityLog & { profile: Pick<Profile, 'id' | 'name' | 'email'> | null }>;
}

// Database type for Supabase typed client
// Must include Relationships array (can be empty) for Supabase generic constraints
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Omit<Profile, 'id'>> & Pick<Profile, 'id' | 'email'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      drivers: {
        Row: Driver;
        Insert: Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at'>> & Pick<Driver, 'name'>;
        Update: Partial<Driver>;
        Relationships: [];
      };
      delivery_cards: {
        Row: DeliveryCard;
        Insert: Partial<Omit<DeliveryCard, 'id' | 'delivery_ref' | 'status_changed_at' | 'created_at' | 'updated_at'>> & Pick<DeliveryCard, 'destination' | 'created_by'>;
        Update: Partial<DeliveryCard>;
        Relationships: [];
      };
      delivery_customers: {
        Row: DeliveryCustomer;
        Insert: Partial<Omit<DeliveryCustomer, 'id' | 'created_at' | 'updated_at'>> & Pick<DeliveryCustomer, 'delivery_card_id' | 'customer_name'>;
        Update: Partial<DeliveryCustomer>;
        Relationships: [];
      };
      customer_sale_orders: {
        Row: CustomerSaleOrder;
        Insert: Partial<Omit<CustomerSaleOrder, 'id' | 'created_at'>> & Pick<CustomerSaleOrder, 'delivery_customer_id' | 'sale_order_number'>;
        Update: Partial<CustomerSaleOrder>;
        Relationships: [];
      };
      extra_delivery_items: {
        Row: ExtraDeliveryItem;
        Insert: Partial<Omit<ExtraDeliveryItem, 'id' | 'created_at'>> & Pick<ExtraDeliveryItem, 'delivery_customer_id' | 'item_name'>;
        Update: Partial<ExtraDeliveryItem>;
        Relationships: [];
      };
      attachments: {
        Row: Attachment;
        Insert: Partial<Omit<Attachment, 'id' | 'created_at'>> & Pick<Attachment, 'delivery_card_id' | 'file_name' | 'file_url' | 'storage_path' | 'uploaded_by'>;
        Update: Partial<Attachment>;
        Relationships: [];
      };
      comments: {
        Row: Comment;
        Insert: Partial<Omit<Comment, 'id' | 'created_at'>> & Pick<Comment, 'delivery_card_id' | 'user_id' | 'body'>;
        Update: Partial<Comment>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLog;
        Insert: Partial<Omit<ActivityLog, 'id' | 'created_at'>> & Pick<ActivityLog, 'action'>;
        Update: Partial<ActivityLog>;
        Relationships: [];
      };
      notification_events: {
        Row: NotificationEvent;
        Insert: Partial<Omit<NotificationEvent, 'id' | 'created_at'>> & Pick<NotificationEvent, 'type'>;
        Update: Partial<NotificationEvent>;
        Relationships: [];
      };
      planning_queue: {
        Row: PlanningQueueItem;
        Insert: Partial<Omit<PlanningQueueItem, 'id' | 'created_at'>> & Pick<PlanningQueueItem, 'customer_name'>;
        Update: Partial<PlanningQueueItem>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      delivery_status: 'draft' | 'pending_booking' | 'booked' | 'in_transit' | 'delivered';
      delivery_priority: DeliveryPriority;
      notification_status: NotificationStatus;
    };
  };
};
