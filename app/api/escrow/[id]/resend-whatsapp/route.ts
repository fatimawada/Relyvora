import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  applyWhatsappVerificationRedaction,
  maskWhatsappNumber,
  selectTransactionWithWhatsapp,
  sendPaymentLinkWhatsappTemplate,
} from '@/lib/whatsapp';

/**
 * Re-sends the `payment_link_v1` WhatsApp confirmation message for an unverified order.
 * Strict security controls:
 * - Rate-limited by client IP and per transaction (max 2 resends per 10 minutes).
 * - Sends ONLY to the buyer phone number originally registered by the verified vendor.
 * - Blocked if the recipient tapped "Not me" or replied STOP.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required.' }, { status: 400 });
    }

    const clientIp = getClientIp(request);
    const ipLimit = checkRateLimit(`${clientIp}:resend_wa_confirm`, 10, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many confirmation requests from this connection. Try again shortly.' },
        { status: 429 }
      );
    }

    const orderLimit = checkRateLimit(`order:${id}:resend_wa_confirm`, 2, 10 * 60 * 1000);
    if (!orderLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Confirmation message was just sent. Please check WhatsApp or wait a few minutes.' },
        { status: 429 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: tx, error: txErr } = await selectTransactionWithWhatsapp<any>(
      supabase,
      id,
      'id, status, item_name, total_amount, vendor_id, vendor_handle, buyer_phone'
    );

    if (txErr || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (tx.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { success: false, error: 'Order is no longer awaiting payment.' },
        { status: 400 }
      );
    }

    const waState = applyWhatsappVerificationRedaction(tx);
    if (waState.whatsapp_blocked) {
      return NextResponse.json(
        { success: false, error: 'This payment link has been blocked at the recipient request.' },
        { status: 403 }
      );
    }

    if (waState.buyer_phone_verified) {
      return NextResponse.json(
        { success: false, error: 'Buyer WhatsApp number is already verified for this order.' },
        { status: 400 }
      );
    }

    if (!tx.buyer_phone || !tx.buyer_phone.trim()) {
      return NextResponse.json(
        { success: false, error: 'No buyer WhatsApp number is associated with this order.' },
        { status: 400 }
      );
    }

    const sendRes = await sendPaymentLinkWhatsappTemplate(
      {
        transactionId: tx.id,
        vendorId: tx.vendor_id,
        vendorDisplayName: tx.vendor_handle || 'Relyvora Vendor',
        itemName: tx.item_name || 'Escrow Item',
        totalAmount: Number(tx.total_amount) || 0,
        buyerPhone: tx.buyer_phone,
      },
      supabase
    );

    if (!sendRes.success) {
      return NextResponse.json(
        {
          success: false,
          whatsapp_delivery_status: sendRes.status,
          error: sendRes.error || 'Could not re-send WhatsApp confirmation message.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      whatsapp_delivery_status: sendRes.status,
      buyer_phone_masked: maskWhatsappNumber(tx.buyer_phone),
    });
  } catch (err: any) {
    console.error('Unhandled error in resend-whatsapp:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
