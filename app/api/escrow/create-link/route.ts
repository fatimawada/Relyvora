import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { calculatePricing } from '@/lib/pricing';
import { isLiveMode, getPaymentsMode } from '@/lib/paymentsMode';
import { createAnchorCollectionAccount, RELYVORA_FBO_ACCOUNT_ID } from '@/lib/anchor';
import { validateOrderCreation } from '@/lib/safetyLimits';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName, itemPrice, deliveryFee = 0, vendorHandle, buyerPhone, buyerNotes } = body;

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      return NextResponse.json({ success: false, error: 'Item name is required.' }, { status: 400 });
    }

    const priceNum = Number(itemPrice) || 0;
    if (priceNum <= 0) {
      return NextResponse.json({ success: false, error: 'Valid item price is required.' }, { status: 400 });
    }

    const deliveryNum = Number(deliveryFee) || 0;
    const pricing = calculatePricing(priceNum, deliveryNum);

    const mode = getPaymentsMode();
    const activeHandle = (vendorHandle || '').trim() || '@LagosHairPlug';

    // Phase G2: Kill Switch, Maximum Cap & Vendor Allowlist validation
    const safetyCheck = validateOrderCreation({
      vendorHandle: activeHandle,
      totalAmount: pricing.totalAmount,
    });

    if (!safetyCheck.allowed) {
      const statusCode = safetyCheck.code === 'CHECKOUT_DISABLED' ? 503 : 403;
      return NextResponse.json(
        { success: false, error: safetyCheck.error, code: safetyCheck.code },
        { status: statusCode }
      );
    }
    const txId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}`;
    const now = new Date().toISOString();

    let virtualNubanId: string | null = null;
    let virtualAccountNumber: string | null = null;
    let virtualBankName: string | null = null;

    // If live mode is enabled, provision real Anchor Virtual NUBAN linked to Escrow FBO
    if (isLiveMode()) {
      try {
        const collection = await createAnchorCollectionAccount({
          settlementAccountId: RELYVORA_FBO_ACCOUNT_ID,
          metadata: {
            transactionId: txId,
            vendorHandle: activeHandle,
            totalAmount: pricing.totalAmount,
          },
        });
        virtualNubanId = collection.virtualNubanId;
        virtualAccountNumber = collection.accountNumber;
        virtualBankName = collection.bankName;
      } catch (anchorErr: any) {
        console.error('Failed to create Anchor collection account:', anchorErr);
        return NextResponse.json(
          { success: false, error: 'Failed to provision banking collection rails: ' + anchorErr.message },
          { status: 502 }
        );
      }
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          id: txId,
          item_name: itemName.trim(),
          item_price: priceNum,
          protection_fee: pricing.protectionFee,
          total_amount: pricing.totalAmount,
          vendor_handle: activeHandle,
          buyer_phone: (buyerPhone || '').trim() || null,
          buyer_notes: (buyerNotes || '').trim() || null,
          status: 'AWAITING_PAYMENT',
          payments_mode: mode,
          virtual_nuban_id: virtualNubanId,
          virtual_account_number: virtualAccountNumber,
          virtual_bank_name: virtualBankName,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase transaction insert failed:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transaction: data }, { status: 201 });
  } catch (err: any) {
    console.error('Unhandled error in create-link:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
