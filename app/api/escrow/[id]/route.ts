import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getServerPaymentsMode } from '@/lib/paymentsMode';
import { maskPhoneNumber } from '@/lib/smsDelivery';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  applyWhatsappVerificationRedaction,
  selectTransactionWithWhatsapp,
} from '@/lib/whatsapp';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Query transaction with service role, selecting buyer_phone only to compute mask server-side
    const { data: tx, error } = await selectTransactionWithWhatsapp<any>(
      supabase,
      id,
      `${SAFE_TRANSACTION_PUBLIC_COLUMNS}, buyer_phone, virtual_nuban_id`
    );

    if (error || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const withRedaction = applyWhatsappVerificationRedaction(tx);

    // NEVER return the plaintext release code, release_code_hash, dispute_otp_hash, unmasked buyer PII,
    // or virtual account details for unverified / blocked orders.
    const sanitizedTransaction = {
      id: withRedaction.id,
      created_at: withRedaction.created_at,
      updated_at: withRedaction.updated_at,
      item_name: withRedaction.item_name,
      item_price: withRedaction.item_price,
      delivery_fee: withRedaction.delivery_fee || 0,
      protection_fee: withRedaction.protection_fee,
      total_amount: withRedaction.total_amount,
      amount_paid: withRedaction.amount_paid || 0,
      excess_amount: withRedaction.excess_amount || 0,
      vendor_handle: withRedaction.vendor_handle,
      status: withRedaction.status,
      payments_mode: withRedaction.payments_mode || getServerPaymentsMode(),
      paid_at: withRedaction.paid_at,
      dispatched_at: withRedaction.dispatched_at,
      released_at: withRedaction.released_at,
      disputed_at: withRedaction.disputed_at,
      dispute_reason: withRedaction.dispute_reason,
      virtual_account_number: withRedaction.virtual_account_number,
      virtual_bank_name: withRedaction.virtual_bank_name,
      virtual_account_name: withRedaction.virtual_account_name,
      code_locked: Boolean(withRedaction.code_locked),
      failed_code_attempts: withRedaction.failed_code_attempts || 0,
      code_expires_at: withRedaction.code_expires_at,
      buyer_phone_masked: maskPhoneNumber(withRedaction.buyer_phone),
      has_buyer_phone: Boolean(withRedaction.buyer_phone),
      buyer_whatsapp_consent: Boolean(withRedaction.buyer_whatsapp_consent),
      buyer_phone_verified: Boolean(withRedaction.buyer_phone_verified),
      buyer_phone_verified_at: withRedaction.buyer_phone_verified_at || null,
      whatsapp_delivery_status: withRedaction.whatsapp_delivery_status || 'not_sent',
      whatsapp_blocked: Boolean(withRedaction.whatsapp_blocked),
      release_code: null,
    };

    return NextResponse.json({ success: true, transaction: sanitizedTransaction });
  } catch (err: any) {
    console.error('Unhandled error in get-transaction:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
