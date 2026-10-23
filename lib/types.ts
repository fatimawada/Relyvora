export type TransactionStatus = 
  | 'AWAITING_PAYMENT' 
  | 'FUNDS_LOCKED' 
  | 'DISPATCHED' 
  | 'RELEASED' 
  | 'DISPUTED';

export interface Transaction {
  id: string;
  created_at: string;
  updated_at: string;
  item_name: string;
  item_price: number;
  protection_fee: number;
  total_amount: number;
  vendor_handle: string;
  buyer_phone?: string | null;
  buyer_notes?: string | null;
  status: TransactionStatus;
  release_code?: string | null;
  dispute_reason?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  dispatched_at?: string | null;
  released_at?: string | null;
  disputed_at?: string | null;
}

export interface VendorMetrics {
  lockedInEscrow: number;
  availablePayout: number;
  activeOrders: number;
  totalCompleted: number;
}

export interface PricingBreakdown {
  itemPrice: number;
  protectionFee: number;
  totalAmount: number;
  feePercentage: number;
  minimumFee: number;
}
