export type TransactionStatus = 
  | 'AWAITING_PAYMENT'
  | 'PARTIALLY_FUNDED'
  | 'FUNDS_LOCKED' 
  | 'DISPATCHED' 
  | 'RELEASING'
  | 'RESOLVING'
  | 'VENDOR_PAID'
  | 'RELEASED' 
  | 'DISPUTED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED';

export type DeliveryType = 'same_city' | 'interstate';

export type VendorKycStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export type VendorTier = 'NEW' | 'ESTABLISHED' | 'TRUSTED';

export interface Vendor {
  id: string;
  user_id?: string | null;
  store_name: string;
  legal_first_name?: string | null;
  legal_last_name?: string | null;
  email: string;
  phone_number?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_hash?: string | null;
  anchor_customer_id?: string | null;
  anchor_deposit_account_id?: string | null;
  kyc_status: VendorKycStatus;
  is_allowlisted: boolean;
  tier?: VendorTier;
  successful_sales_count?: number;
  completed_orders_count?: number;
  disputes_count?: number;
  compliance_strikes?: number;
  is_suspended?: boolean;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  prohibited_items_accepted_at?: string | null;
  prohibited_items_version?: string | null;
  first_order_at?: string | null;
  tier_updated_at?: string | null;
  cap_override_unlimited?: boolean;
  cap_override_reason?: string | null;
  cap_override_by?: string | null;
  cap_override_at?: string | null;
  daily_volume_ngn: number;
  daily_volume_reset_at?: string;
  settlement_bank_code?: string | null;
  settlement_account_number?: string | null;
  settlement_account_name?: string | null;
  payout_account_verified?: boolean;
  settlement_account_name_matched?: boolean;
  settlement_name_match_score?: number | null;
  payout_hold_until?: string | null;
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
  code_verified_at?: string | null;
  payout_available_at?: string | null;
  cooling_window_hours?: number | null;
  risk_score?: number;
  risk_signals?: any[];
  review_hold?: boolean;
  review_hold_reason?: string | null;
  order_blocked?: boolean;
  order_block_reason?: string | null;
  sender_name?: string | null;
  sender_account_number?: string | null;
  sender_bank_code?: string | null;
  delivery_type?: DeliveryType;
  delivery_window_days?: number;
  dispatch_deadline_at?: string | null;
  delivery_deadline_at?: string | null;
  reminder_sent_at?: string | null;
  courier_name?: string | null;
  courier_phone?: string | null;
  tracking_number?: string | null;
  dispatch_notes?: string | null;
  dispatch_proof_count?: number;
  handover_proof_count?: number;
  dispute_raised_by?: 'BUYER' | 'VENDOR' | 'ADMIN' | 'SYSTEM' | null;
  dispute_response_deadline_at?: string | null;
  counterparty_response_text?: string | null;
  counterparty_responded_at?: string | null;
  refund_account_verified?: boolean;
  refund_account_verified_at?: string | null;
  refund_account_source?: 'DEPOSIT_SENDER' | 'BUYER_OTP_CONFIRMED' | null;
  expires_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  virtual_account_closed?: boolean;
  excess_refund_amount?: number;
  excess_refund_transfer_id?: string | null;
  buyer_terms_accepted_at?: string | null;
  buyer_terms_version?: string | null;
  whatsapp_retry_count?: number;
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
