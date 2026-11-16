import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { calculatePricing } from '@/lib/pricing';
import { isLiveMode, getServerPaymentsMode } from '@/lib/paymentsMode';
import { createAnchorCollectionAccount, RELYVORA_FBO_ACCOUNT_ID } from '@/lib/anchor';
import { getHotSettings, validateOrderCreationServer } from '@/lib/safetyLimits';
import {
  generateCryptographicReleaseCode,
  computeReleaseCodeHmac,
  calculateDeliveryWindowCodeExpiration,
} from '@/lib/releaseCode';
import {
  getDeliveryAndLifecycleConfig,
  updateTransactionWithFallback,
} from '@/lib/orderLifecycle';
import {
  applyWhatsappVerificationRedaction,
  maskWhatsappNumber,
  normalizeWhatsappPhone,
  sendPaymentLinkWhatsappTemplate,
  updateTransactionWhatsappState,
  WhatsappDeliveryStatus,
} from '@/lib/whatsapp';
import {
  evaluateOrderCreationRisk,
  extractRequestDeviceFingerprints,
  hashPhoneSignal,
  hashSignalWithSalt,
  persistRiskEvaluation,
} from '@/lib/riskEngine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      itemName,
      itemPrice,
      deliveryFee = 0,
      deliveryType = 'same_city',
      vendorHandle,
      vendorId,
      buyerPhone,
      buyerWhatsappConsent,
      buyerNotes,
      deviceFingerprint,
      buyerIpAddress,
      buyerDeviceFingerprint,
      buyerUserAgent,
    } = body;

    if (deliveryType !== 'same_city' && deliveryType !== 'interstate') {
      return NextResponse.json(
        { success: false, error: "deliveryType must be 'same_city' or 'interstate'." },
        { status: 400 }
      );
    }

    const normalizedBuyerPhone = normalizeWhatsappPhone(buyerPhone);
    const hasWhatsappConsent = buyerWhatsappConsent === true;

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

    // Phase G1.5 + Open Signup Tier/KYC/Payout Account + Suspension Gates
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

    const supabase = getServiceSupabase();
    const creatorFps = await extractRequestDeviceFingerprints(request, deviceFingerprint);
    const buyerIpHash = buyerIpAddress ? hashSignalWithSalt(String(buyerIpAddress)) : null;
    const buyerDeviceHash = buyerDeviceFingerprint ? hashSignalWithSalt(String(buyerDeviceFingerprint)) : null;
    const buyerUaHash = buyerUserAgent ? hashSignalWithSalt(String(buyerUserAgent)) : null;

    // Server-side Risk Engine evaluation at order creation
    const riskEval = await evaluateOrderCreationRisk({
      vendor: safetyCheck.vendor || { id: vendorId, store_name: activeHandle },
      totalAmount: pricing.totalAmount,
      buyerPhone: normalizedBuyerPhone || buyerPhone || null,
      creatorIpHash: creatorFps.ipHash,
      creatorUaHash: creatorFps.uaHash,
      creatorDeviceHash: creatorFps.deviceHash,
      buyerIpHash,
      buyerUaHash,
      buyerDeviceHash,
      supabaseClient: supabase,
    });

    if (riskEval.orderBlocked) {
      await persistRiskEvaluation({
        vendorId: safetyCheck.vendor?.id || null,
        vendorHandle: safetyCheck.vendor?.store_name || activeHandle,
        evaluation: riskEval,
        metadata: { stage: 'create_link', totalAmount: pricing.totalAmount },
        supabaseClient: supabase,
      });

      return NextResponse.json(
        {
          success: false,
          code: 'ORDER_BLOCKED_RISK',
          error:
            riskEval.reason ||
            'Order creation blocked by automated risk controls.',
          riskScore: riskEval.score,
          signals: riskEval.signals,
        },
        { status: 403 }
      );
    }

    const txId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}`;
    const now = new Date().toISOString();
    const isLive = isLiveMode();

    const lcConfig = await getDeliveryAndLifecycleConfig(supabase);
    const deliveryWindowDays =
      deliveryType === 'interstate'
        ? lcConfig.delivery.interstate_days
        : lcConfig.delivery.same_city_days;
    const paymentExpiryIso = new Date(
      Date.now() + lcConfig.lifecycle.payment_expiry_hours * 3600 * 1000
    ).toISOString();

    // Release code generation:
    // In LIVE mode, the 6-digit release code is generated ONLY inside the webhook funding flow once payment arrives.
    // In SANDBOX mode, pre-generating at link creation is permitted for test harness ergonomics.
    const rawCode = isLive ? null : generateCryptographicReleaseCode();
    const hmacHash = rawCode ? computeReleaseCodeHmac(txId, rawCode) : null;
    const codeExpiresAt = rawCode
      ? calculateDeliveryWindowCodeExpiration(deliveryType, lcConfig.delivery).codeExpiresAt
      : null;

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

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          id: txId,
          vendor_id: safetyCheck.vendor?.id || null,
          item_name: itemName.trim(),
          item_price: priceNum,
          delivery_fee: deliveryNum,
          protection_fee: pricing.protectionFee,
          total_amount: pricing.totalAmount,
          amount_paid: 0,
          excess_amount: 0,
          vendor_handle: activeHandle,
          buyer_phone: normalizedBuyerPhone || (buyerPhone || '').trim() || null,
          buyer_notes: (buyerNotes || '').trim() || null,
          status: 'AWAITING_PAYMENT',
          payments_mode: serverMode,
          virtual_nuban_id: virtualNubanId,
          virtual_account_number: virtualAccountNumber,
          virtual_bank_name: virtualBankName,
          // Live mode: null until webhook funding generates & sends code out-of-band
          release_code_hash: hmacHash,
          code_expires_at: codeExpiresAt,
          failed_code_attempts: 0,
          code_locked: false,
          created_at: now,
          updated_at: now,
        },
      ])
      .select(`
        id,
        created_at,
        updated_at,
        item_name,
        item_price,
        delivery_fee,
        protection_fee,
        total_amount,
        vendor_handle,
        status,
        payments_mode,
        virtual_nuban_id,
        virtual_account_number,
        virtual_bank_name,
        code_expires_at
      `)
      .single();

    if (error) {
      console.error('Supabase transaction insert failed:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Persist delivery window & payment link expiry safely (falls back cleanly pre-migration)
    await updateTransactionWithFallback(
      txId,
      {
        delivery_type: deliveryType,
        delivery_window_days: deliveryWindowDays,
        expires_at: paymentExpiryIso,
        updated_at: now,
      },
      supabase
    );

    // Persist hashed device/IP/phone signals and any risk review hold evaluation
    await persistRiskEvaluation({
      transactionId: txId,
      vendorId: safetyCheck.vendor?.id || null,
      vendorHandle: safetyCheck.vendor?.store_name || activeHandle,
      evaluation: riskEval,
      extraTxPatch: {
        buyer_phone_hash: hashPhoneSignal(normalizedBuyerPhone || buyerPhone),
        creator_ip_hash: creatorFps.ipHash,
        creator_ip_expires_at: creatorFps.ipExpiresAt,
        creator_ua_hash: creatorFps.uaHash,
        creator_device_hash: creatorFps.deviceHash,
        ...(buyerIpHash ? { buyer_ip_hash: buyerIpHash, buyer_ip_expires_at: creatorFps.ipExpiresAt } : {}),
        ...(buyerUaHash ? { buyer_ua_hash: buyerUaHash } : {}),
        ...(buyerDeviceHash ? { buyer_device_hash: buyerDeviceHash } : {}),
      },
      metadata: { stage: 'create_link', totalAmount: pricing.totalAmount, deliveryType },
      supabaseClient: supabase,
    });

    // Initialize WhatsApp verification state (defaults unverified until buyer taps "Confirm this is me")
    await updateTransactionWhatsappState(
      txId,
      {
        buyer_whatsapp_consent: hasWhatsappConsent,
        buyer_phone_verified: false,
        buyer_phone_verified_at: null,
        whatsapp_delivery_status: 'not_sent',
        whatsapp_blocked: false,
      },
      supabase
    );

    let whatsappStatus: WhatsappDeliveryStatus = 'not_sent';
    let whatsappMessageId: string | undefined;
    let whatsappError: string | undefined;

    const settings = await getHotSettings();
    const allowlistMode =
      settings.vendor_allowlist_mode !== undefined
        ? Boolean(settings.vendor_allowlist_mode === true || settings.vendor_allowlist_mode === 'true')
        : false;
    const isVerifiedAndEligible =
      safetyCheck.vendor?.kyc_status === 'verified' &&
      safetyCheck.vendor?.is_suspended !== true &&
      (!allowlistMode || safetyCheck.vendor?.is_allowlisted === true);

    // Auto-send payment_link_v1 when buyer WhatsApp number + consent checkbox + verified eligible vendor
    if (normalizedBuyerPhone && hasWhatsappConsent && isVerifiedAndEligible) {
      const waResult = await sendPaymentLinkWhatsappTemplate(
        {
          transactionId: txId,
          vendorId: safetyCheck.vendor?.id || null,
          vendorDisplayName: safetyCheck.vendor?.store_name || activeHandle,
          itemName: itemName.trim(),
          totalAmount: pricing.totalAmount,
          buyerPhone: normalizedBuyerPhone,
        },
        supabase
      );
      whatsappStatus = waResult.status;
      whatsappMessageId = waResult.messageId;
      whatsappError = waResult.error;
    }

    const sanitizedTx = applyWhatsappVerificationRedaction({
      ...data,
      delivery_type: deliveryType,
      delivery_window_days: deliveryWindowDays,
      expires_at: paymentExpiryIso,
      buyer_whatsapp_consent: hasWhatsappConsent,
      buyer_phone_verified: false,
      buyer_phone_verified_at: null,
      whatsapp_delivery_status: whatsappStatus,
      whatsapp_message_id: whatsappMessageId || null,
      whatsapp_blocked: false,
      has_buyer_phone: Boolean(normalizedBuyerPhone),
      buyer_phone_masked: normalizedBuyerPhone ? maskWhatsappNumber(normalizedBuyerPhone) : null,
      risk_score: riskEval.score,
      review_hold: riskEval.reviewHold,
      review_hold_reason: riskEval.reason,
      order_blocked: false,
      risk_signals: riskEval.signals,
    });

    return NextResponse.json({
      success: true,
      transaction: sanitizedTx,
      whatsapp_delivery_status: whatsappStatus,
      ...(whatsappError ? { whatsapp_error: whatsappError } : {}),
      // In sandbox mode only: return raw code to caller for automated test suites
      ...(isLive ? {} : { sandbox_release_code: rawCode }),
    }, { status: 201 });
  } catch (err: any) {
    console.error('Unhandled error in create-link:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
