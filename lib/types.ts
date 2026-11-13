export type TransactionStatus = 
  | 'AWAITING_PAYMENT'
  | 'PARTIALLY_FUNDED'
  | 'FUNDS_LOCKED' 
  | 'DISPATCHED' 
  | 'RELEASING'
  | 'VENDOR_PAID'
  | 'RELEASED' 
  | 'DISPUTED'
  | 'REFUNDED';

export type VendorKycStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export interface Vendor {
  id: string;
  user_id?: string | null;
  store_name: string;
  legal_first_name?: string | null;
  legal_last_name?: string | null;
  email: string;
  phone_number?: string | null;
  anchor_customer_id?: string | null;
  anchor_deposit_account_id?: string | null;
  kyc_status: VendorKycStatus;
  is_allowlisted: boolean;
  daily_volume_ngn: number;
  daily_volume_reset_at?: string;
  settlement_bank_code?: string | null;
  settlement_account_number?: string | null;
  settlement_account_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  vendor_id?: string | null;
  created_at: string;
  updated_at: string;
  item_name: string;
  item_price: number;
  delivery_fee?: number;
  protection_fee: number;
  total_amount: number;
  amount_paid?: number;
  excess_amount?: number;
  vendor_handle: string;
  buyer_phone?: string | null;
  buyer_phone_masked?: string | null;
  has_buyer_phone?: boolean;
  buyer_whatsapp_consent?: boolean;
  buyer_phone_verified?: boolean;
  buyer_phone_verified_at?: string | null;
  whatsapp_message_id?: string | null;
  whatsapp_delivery_status?: 'not_sent' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  whatsapp_blocked?: boolean;
  buyer_notes?: string | null;
  status: TransactionStatus;
  release_code?: string | null; // Deprecated: dropped from DB in Phase G1.5
  release_code_hash?: string | null;
  release_code_salt?: string | null; // Deprecated: dropped from DB in Phase G1.5
  failed_code_attempts?: number;
  code_locked?: boolean;
  code_locked_at?: string | null;
  code_expires_at?: string | null;
  releasing_at?: string | null;
  vendor_paid_at?: string | null;
  virtual_nuban_id?: string | null;
  virtual_account_number?: string | null;
  virtual_bank_name?: string | null;
  virtual_account_name?: string | null;
  anchor_deposit_id?: string | null;
  anchor_transfer_id?: string | null;
  anchor_vendor_transfer_id?: string | null;
  anchor_fee_transfer_id?: string | null;
  anchor_revenue_transfer_id?: string | null;
  leg1_idempotency_key?: string | null;
  leg2_idempotency_key?: string | null;
  idempotency_key?: string | null;
  payments_mode?: string;
  dispute_reason?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  dispatched_at?: string | null;
  released_at?: string | null;
  disputed_at?: string | null;
  dispute_scenario?: number | null;
  resolved_at?: string | null;
  resolution_action?: string | null;
  resolution_notes?: string | null;
}

export interface VendorMetrics {
  lockedInEscrow: number;
  availablePayout: number;
  activeOrders: number;
  totalCompleted: number;
}

export interface PricingBreakdown {
  itemPrice: number;
  deliveryFee?: number;
  protectionFee: number;
  totalAmount: number;
  feePercentage: number;
  minimumFee: number;
}
