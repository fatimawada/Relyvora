import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { calculatePricing } from '@/lib/pricing';
import { isLiveMode, getServerPaymentsMode } from '@/lib/paymentsMode';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { createAnchorCollectionAccount, RELYVORA_FBO_ACCOUNT_ID } from '@/lib/anchor';
import {
  getVendorAllowlistModeServer,
  validateOrderCreationServer,
} from '@/lib/safetyLimits';
import {
  generateCryptographicReleaseCode,
  computeReleaseCodeHmac,
  calculateDeliveryWindowCodeExpiration,
} from '@/lib/releaseCode';
import { getDeliveryAndLifecycleConfig } from '@/lib/orderLifecycle';
import { resolveVendorSessionForWrite } from '@/lib/orderAuth';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import {
  applyWhatsappVerificationRedaction,
  maskWhatsappNumber,
  normalizeWhatsappPhone,
  sendPaymentLinkWhatsappTemplate,
  WhatsappDeliveryStatus,
} from '@/lib/whatsapp';
import {
  evaluateOrderCreationRisk,
  extractRequestDeviceFingerprints,
  hashPhoneSignal,
  persistRiskEvaluation,
} from '@/lib/riskEngine';

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();

    // 1. Strict Vendor Session Authentication (never trust client-supplied vendorHandle/vendorId alone)
    const vendorSession = await resolveVendorSessionForWrite(request, supabase);
    if (!vendorSession.authorized || !vendorSession.vendor) {
      return NextResponse.json(
        {
          success: false,
          code: vendorSession.code || 'UNAUTHORIZED',
          error: vendorSession.error || 'Vendor authentication required.',
        },
        { status: vendorSession.statusCode || 401 }
      );
    }

    const clientIp = getClientIp(request);
    const [ipRl, vendorRl] = await Promise.all([
      checkSharedRateLimit(`create_link_ip:${clientIp}`, 30, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`create_link_v:${vendorSession.vendor.id}`, 30, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !vendorRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many order link creation attempts. Try again shortly.' },
        { status: 429 }
      );
    }

    // 1b. Option B Live Gate: requires PAYMENTS_MODE=live, LAUNCH_STATUS=live, verified KYC & approved release template
    const liveGate = await evaluateLivePaymentGateServer({
      vendor: vendorSession.vendor,
      supabaseClient: supabase,
    });
    if (!liveGate.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: liveGate.code || 'PAYMENTS_NOT_LIVE',
          error: liveGate.error || 'Payments open soon.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      itemName,
      itemPrice,
      deliveryFee = 0,
      deliveryType = 'same_city',
      buyerPhone,
      buyerWhatsappConsent,
      buyerNotes,
      deviceFingerprint,
    } = body || {};

    if (deliveryType !== 'same_city' && deliveryType !== 'interstate') {
      return NextResponse.json(
        { success: false, error: "deliveryType must be 'same_city' or 'interstate'." },
        { status: 400 }
      );
    }

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      return NextResponse.json({ success: false, error: 'Item name is required.' }, { status: 400 });
    }

    const priceNum = Number(itemPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json({ success: false, error: 'Valid positive item price is required.' }, { status: 400 });
    }

    const deliveryNum =
      deliveryFee === undefined || deliveryFee === null || deliveryFee === ''
        ? 0
        : Number(deliveryFee);
    if (!Number.isFinite(deliveryNum) || deliveryNum < 0) {
      return NextResponse.json({ success: false, error: 'Delivery fee must be zero or positive.' }, { status: 400 });
    }

    // Server computes exact fee & total (never trust client protectionFee/totalAmount/status)
    const pricing = calculatePricing(priceNum, deliveryNum);
    const normalizedBuyerPhone = normalizeWhatsappPhone(buyerPhone);
    const hasWhatsappConsent = buyerWhatsappConsent === true;
    const serverMode = getServerPaymentsMode();
    const authedVendor = vendorSession.vendor;
    const activeHandle = authedVendor.store_name.startsWith('@')
      ? authedVendor.store_name
      : `@${authedVendor.store_name}`;

    // Phase G1.5 + Open Signup Tier/KYC/Payout Account + Suspension Gates using authenticated vendor UUID
    const safetyCheck = await validateOrderCreationServer({
      vendorHandle: authedVendor.id,
      totalAmount: pricing.totalAmount,
    });

    if (!safetyCheck.allowed || !safetyCheck.vendor) {
      const statusCode = safetyCheck.code === 'CHECKOUT_DISABLED' ? 503 : 403;
      return NextResponse.json(
        { success: false, error: safetyCheck.error, code: safetyCheck.code },
        { status: statusCode }
      );
    }

    const creatorFps = await extractRequestDeviceFingerprints(request, deviceFingerprint);

    // Server-side Risk Engine evaluation at order creation
    const riskEval = await evaluateOrderCreationRisk({
      vendor: safetyCheck.vendor,
      totalAmount: pricing.totalAmount,
      buyerPhone: normalizedBuyerPhone || buyerPhone || null,
      creatorIpHash: creatorFps.ipHash,
      creatorUaHash: creatorFps.uaHash,
      creatorDeviceHash: creatorFps.deviceHash,
      supabaseClient: supabase,
    });

    if (riskEval.orderBlocked) {
      await persistRiskEvaluation({
        vendorId: safetyCheck.vendor.id,
        vendorHandle: activeHandle,
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

    const txId = crypto.randomUUID();
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

    const rawCode = isLive ? null : generateCryptographicReleaseCode();
    const hmacHash = rawCode ? computeReleaseCodeHmac(txId, rawCode) : null;
    const codeExpiresAt = rawCode
      ? calculateDeliveryWindowCodeExpiration(deliveryType, lcConfig.delivery).codeExpiresAt
      : null;

    let virtualNubanId: string | null = null;
    let virtualAccountNumber: string | null = null;
    let virtualBankName: string | null = null;

    if (isLive) {
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
          vendor_id: safetyCheck.vendor.id,
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
          buyer_whatsapp_consent: hasWhatsappConsent,
          buyer_phone_verified: false,
          buyer_phone_verified_at: null,
          whatsapp_delivery_status: 'not_sent',
          whatsapp_blocked: false,
          delivery_type: deliveryType,
          delivery_window_days: deliveryWindowDays,
          expires_at: paymentExpiryIso,
          status: 'AWAITING_PAYMENT',
          payments_mode: serverMode,
          virtual_nuban_id: virtualNubanId,
          virtual_account_number: virtualAccountNumber,
          virtual_bank_name: virtualBankName,
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
        vendor_id,
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
        code_expires_at,
        delivery_type,
        delivery_window_days,
        expires_at
      `)
      .single();

    if (error || !data) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Transaction Insert Failed in create-link (Fail Closed)',
        details: { error: error?.message || 'Empty insert result' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: error?.message || 'Transaction creation failed.' },
        { status: 500 }
      );
    }

    await persistRiskEvaluation({
      transactionId: txId,
      vendorId: safetyCheck.vendor.id,
      vendorHandle: activeHandle,
      evaluation: riskEval,
      extraTxPatch: {
        buyer_phone_hash: hashPhoneSignal(normalizedBuyerPhone || buyerPhone),
        creator_ip_hash: creatorFps.ipHash,
        creator_ip_expires_at: creatorFps.ipExpiresAt,
        creator_ua_hash: creatorFps.uaHash,
        creator_device_hash: creatorFps.deviceHash,
      },
      metadata: { stage: 'create_link', totalAmount: pricing.totalAmount, deliveryType },
      supabaseClient: supabase,
    });

    let whatsappStatus: WhatsappDeliveryStatus = 'not_sent';
    let whatsappMessageId: string | undefined;
    let whatsappError: string | undefined;

    const allowlistMode = await getVendorAllowlistModeServer();
    const isVerifiedAndEligible =
      safetyCheck.vendor.kyc_status === 'verified' &&
      safetyCheck.vendor.is_suspended !== true &&
      (!allowlistMode || safetyCheck.vendor.is_allowlisted === true);

    if (normalizedBuyerPhone && hasWhatsappConsent && isVerifiedAndEligible) {
      const waResult = await sendPaymentLinkWhatsappTemplate(
        {
          transactionId: txId,
          vendorId: safetyCheck.vendor.id,
          vendorDisplayName: safetyCheck.vendor.store_name || activeHandle,
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
      ...(isLive ? {} : { sandbox_release_code: rawCode }),
    }, { status: 201 });
  } catch (err: any) {
    console.error('Unhandled error in create-link:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
