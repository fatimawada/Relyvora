import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { calculatePricing } from '@/lib/pricing';
import { isLiveMode, getServerPaymentsMode } from '@/lib/paymentsMode';
import { createAnchorCollectionAccount, RELYVORA_FBO_ACCOUNT_ID } from '@/lib/anchor';
import { validateOrderCreationServer } from '@/lib/safetyLimits';
import { 
  generateCryptographicReleaseCode, 
  computeReleaseCodeHmac, 
  calculateCodeExpiration 
} from '@/lib/releaseCode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName, itemPrice, deliveryFee = 0, vendorHandle, vendorId, buyerPhone, buyerNotes } = body;

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      return NextResponse.json({ success: false, error: 'Item name is required.' }, { status: 400 });
    }

    const priceNum = Number(itemPrice) || 0;
    if (priceNum <= 0) {
      return NextResponse.json({ success: false, error: 'Valid item price is required.' }, { status: 400 });
    }

    const deliveryNum = Number(deliveryFee) || 0;
    const pricing = calculatePricing(priceNum, deliveryNum);

    const serverMode = getServerPaymentsMode();
    const activeHandle = (vendorHandle || '').trim() || '@LagosHairPlug';

    // Phase G1.5: Database-backed hot kill switches, caps & allowlist validation
    const safetyCheck = await validateOrderCreationServer({
      vendorHandle: (vendorId || activeHandle),
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

    // Generate cryptographic release code and HMAC-SHA256 (keyed by server-side RELEASE_CODE_PEPPER)
    const rawCode = generateCryptographicReleaseCode();
    const hmacHash = computeReleaseCodeHmac(txId, rawCode);
    const codeExpiresAt = calculateCodeExpiration(72);

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
    const isLive = isLiveMode();

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          id: txId,
          vendor_id: safetyCheck.vendor?.id || null,
          item_name: itemName.trim(),
          item_price: priceNum,
          protection_fee: pricing.protectionFee,
          total_amount: pricing.totalAmount,
          amount_paid: 0,
          excess_amount: 0,
          vendor_handle: activeHandle,
          buyer_phone: (buyerPhone || '').trim() || null,
          buyer_notes: (buyerNotes || '').trim() || null,
          status: 'AWAITING_PAYMENT',
          payments_mode: serverMode,
          virtual_nuban_id: virtualNubanId,
          virtual_account_number: virtualAccountNumber,
          virtual_bank_name: virtualBankName,
          // CRITICAL: Plaintext code is NEVER stored in database; verified via HMAC-SHA256 only
          release_code_hash: hmacHash,
          code_expires_at: codeExpiresAt,
          failed_code_attempts: 0,
          code_locked: false,
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

    return NextResponse.json({ 
      success: true, 
      transaction: data,
      // In sandbox mode only: return raw code to caller for automated test suites
      ...(isLive ? {} : { sandbox_release_code: rawCode })
    }, { status: 201 });
  } catch (err: any) {
    console.error('Unhandled error in create-link:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
