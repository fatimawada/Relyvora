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

export interface Transaction {
  id: string;
  vendor_id?: string | null;
  created_at: string;
  updated_at: string;
  item_name: string;
  item_price: number;
  protection_fee: number;
  total_amount: number;
  amount_paid?: number;
  excess_amount?: number;
  vendor_handle: string;
  buyer_phone?: string | null;
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
