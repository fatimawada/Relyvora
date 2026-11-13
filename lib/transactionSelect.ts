/**
 * Explicit safe column projection for public/semi-public transaction API responses.
 * NEVER includes cryptographic hashes (release_code_hash, dispute_otp_hash) or raw secrets.
 */
export const SAFE_TRANSACTION_PUBLIC_COLUMNS = `
  id,
  created_at,
  updated_at,
  item_name,
  item_price,
  delivery_fee,
  protection_fee,
  total_amount,
  amount_paid,
  excess_amount,
  vendor_handle,
  status,
  payments_mode,
  paid_at,
  dispatched_at,
  released_at,
  disputed_at,
  dispute_reason,
  virtual_account_number,
  virtual_bank_name,
  virtual_account_name,
  code_locked,
  failed_code_attempts,
  code_expires_at
`;
