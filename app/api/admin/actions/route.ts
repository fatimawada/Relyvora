import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp } from '@/lib/rateLimit';
import { logAndAlertAdminAction, validateAdminTypedConfirmation } from '@/lib/adminSafety';
import {
  calculateDeliveryWindowCodeExpiration,
  computeReleaseCodeHmac,
  generateCryptographicReleaseCode,
} from '@/lib/releaseCode';
import { isLiveMode } from '@/lib/paymentsMode';
import { maskPhoneNumber, sendReleaseCodeSmsOrWhatsapp } from '@/lib/smsDelivery';
import { normalizeWhatsappPhone } from '@/lib/whatsapp';
import { hashPhoneSignal } from '@/lib/riskEngine';
import { recordVendorComplianceStrike, setVendorSuspensionState } from '@/lib/vendorTiers';
import {
  executeBuyerOrderRefund,
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
  retryStuckSettlementLegs,
} from '@/lib/orderLifecycle';
import { clearSafetySettingsCache } from '@/lib/safetyLimits';

const EDITABLE_SYSTEM_SETTING_KEYS = new Set([
  'checkout_enabled',
  'payouts_enabled',
  'vendor_allowlist_mode',
  'max_order_ngn',
  'max_daily_vendor_volume_ngn',
  'tier1_order_limit_ngn',
  'tier_upgrade_threshold',
  'max_daily_vendor_whatsapp_messages',
  'max_daily_buyer_whatsapp_messages',
  'tier_config',
  'payout_safety_config',
  'risk_engine_config',
  'cooling_window_config',
  'admin_safety_config',
  'delivery_window_config',
  'dispute_policy_config',
  'dispatch_proof_config',
  'order_lifecycle_config',
  'retention_and_storage_config',
]);

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          code: auth.code,
          aal: auth.aal,
          mfaEnrolled: auth.mfaEnrolled,
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    const adminEmail = auth.user.email;
    const clientIp = getClientIp(request);
    const body = await request.json();
    const { action } = body || {};
    const supabase = getServiceSupabase();
    const isLive = isLiveMode();

    // 1. Admin Reissue Code (requires reason + identity context)
    if (action === 'reissue_code') {
      const { transactionId, reason } = body;
      if (!transactionId || !reason || String(reason).trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'transactionId and documented reason (>=3 chars) are required.' },
          { status: 400 }
        );
      }
      const { data: rawTx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();
      if (txErr || !rawTx) {
        return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
      }
      const tx = mergeTransactionWithLifecycleOverlay(rawTx);
      if (tx.status !== 'FUNDS_LOCKED' && tx.status !== 'DISPATCHED') {
        return NextResponse.json(
          { success: false, error: `Cannot reissue code in status '${tx.status}'.` },
          { status: 400 }
        );
      }

      const cfg = await getDeliveryAndLifecycleConfig(supabase);
      const life = calculateDeliveryWindowCodeExpiration(
        (tx.delivery_type as any) === 'interstate' ? 'interstate' : 'same_city',
        cfg.delivery
      );
      const rawCode = generateCryptographicReleaseCode();
      const hmacHash = computeReleaseCodeHmac(tx.id, rawCode);

      await supabase
        .from('transactions')
        .update({
          release_code_hash: hmacHash,
          code_expires_at: life.codeExpiresAt,
          failed_code_attempts: 0,
          code_locked: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      const delivery = await sendReleaseCodeSmsOrWhatsapp({
        transactionId: tx.id,
        buyerPhone: tx.buyer_phone,
        releaseCode: rawCode,
        itemName: tx.item_name || 'Escrow Order',
        totalAmount: Number(tx.total_amount) || 0,
        vendorHandle: tx.vendor_handle || '',
      });

      await logAndAlertAdminAction({
        adminEmail,
        action: 'ADMIN_REISSUE_RELEASE_CODE',
        targetType: 'transaction',
        targetId: tx.id,
        ipAddress: clientIp,
        alertTitle: `Admin Reissued Release Code (${tx.id.slice(0, 8)})`,
        severity: 'WARNING',
        metadata: {
          reason: String(reason).trim(),
          maskedBuyerPhone: delivery.maskedPhone,
          channel: delivery.channel,
          codeExpiresAt: life.codeExpiresAt,
        },
        supabaseClient: supabase,
      });

      return NextResponse.json({
        success: true,
        maskedBuyerPhone: delivery.maskedPhone,
        codeExpiresAt: life.codeExpiresAt,
        ...(!isLive ? { sandbox_release_code: rawCode } : {}),
      });
    }

    // 2. Admin Change Buyer Phone (reason + audit + notify support email)
    if (action === 'change_buyer_phone') {
      const { transactionId, newBuyerPhone, reason } = body;
      const e164 = normalizeWhatsappPhone(newBuyerPhone);
      if (!transactionId || !e164 || !reason || String(reason).trim().length < 5) {
        return NextResponse.json(
          { success: false, error: 'transactionId, valid Nigerian phone number, and reason (>=5 chars) are required.' },
          { status: 400 }
        );
      }

      const { data: tx } = await supabase
        .from('transactions')
        .select('id, buyer_phone, vendor_handle, item_name')
        .eq('id', transactionId)
        .single();
      if (!tx) {
        return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
      }

      const nowIso = new Date().toISOString();
      const newPhoneHash = hashPhoneSignal(e164);
      const { error: updErr } = await supabase
        .from('transactions')
        .update({
          buyer_phone: e164,
          buyer_phone_hash: newPhoneHash,
          buyer_phone_verified: false,
          whatsapp_delivery_status: 'not_sent',
          updated_at: nowIso,
        })
        .eq('id', tx.id);

      if (updErr) {
        await supabase
          .from('transactions')
          .update({ buyer_phone: e164, updated_at: nowIso })
          .eq('id', tx.id);
      }

      await logAndAlertAdminAction({
        adminEmail,
        action: 'ADMIN_CHANGE_BUYER_PHONE',
        targetType: 'transaction',
        targetId: tx.id,
        ipAddress: clientIp,
        alertTitle: `Admin Changed Buyer WhatsApp Number (${tx.id.slice(0, 8)}) — Support Notification`,
        severity: 'CRITICAL',
        metadata: {
          supportNotifyEmail: 'support@relyvora.com',
          vendorHandle: tx.vendor_handle,
          itemName: tx.item_name,
          oldPhoneMasked: maskPhoneNumber(tx.buyer_phone),
          newPhoneMasked: maskPhoneNumber(e164),
          reason: String(reason).trim(),
        },
        supabaseClient: supabase,
      });

      return NextResponse.json({
        success: true,
        transactionId: tx.id,
        newPhoneMasked: maskPhoneNumber(e164),
      });
    }

    // 3. Suspend / Restore Vendor
    if (action === 'suspend_vendor' || action === 'restore_vendor') {
      const { vendorId, reason } = body;
      if (!vendorId) {
        return NextResponse.json({ success: false, error: 'vendorId is required.' }, { status: 400 });
      }
      const res = await setVendorSuspensionState({
        vendorId,
        suspend: action === 'suspend_vendor',
        reason: String(reason || ''),
        adminEmail,
        ipAddress: clientIp,
        supabaseClient: supabase,
      });
      return NextResponse.json(res, { status: res.statusCode });
    }

    // 4. Record Compliance Strike
    if (action === 'add_compliance_strike') {
      const { vendorId, transactionId, reason } = body;
      if (!vendorId || !reason || String(reason).trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'vendorId and documented reason (>=3 chars) are required.' },
          { status: 400 }
        );
      }
      const res = await recordVendorComplianceStrike({
        vendorId,
        transactionId,
        reason: String(reason).trim(),
        adminEmail,
        ipAddress: clientIp,
        supabaseClient: supabase,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    // 5. Retry Stuck Settlement Legs
    if (action === 'retry_transfer_leg') {
      const retryReport = await retryStuckSettlementLegs(supabase);
      await logAndAlertAdminAction({
        adminEmail,
        action: 'ADMIN_RETRY_STUCK_TRANSFER_LEGS',
        targetType: 'system',
        targetId: body.transactionId || 'batch',
        ipAddress: clientIp,
        alertTitle: 'Admin Triggered Stuck Transfer Leg Retry',
        severity: 'WARNING',
        metadata: { ...retryReport, reason: body.reason || 'Manual stuck leg retry' },
        supabaseClient: supabase,
      });
      return NextResponse.json({ success: true, report: retryReport });
    }

    // 6. Edit system_settings with Audit Log
    if (action === 'update_system_setting') {
      const { key, value, reason } = body;
      if (!key || !EDITABLE_SYSTEM_SETTING_KEYS.has(String(key))) {
        return NextResponse.json(
          { success: false, error: `Setting key '${key}' is not editable via Admin Console.` },
          { status: 400 }
        );
      }
      if (value === undefined || !reason || String(reason).trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'Setting value and documented reason (>=3 chars) are required.' },
          { status: 400 }
        );
      }

      const { error: setErr } = await supabase
        .from('system_settings')
        .upsert(
          {
            key: String(key),
            value,
            updated_by: adminEmail,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (setErr) {
        return NextResponse.json({ success: false, error: setErr.message }, { status: 500 });
      }
      clearSafetySettingsCache();

      await logAndAlertAdminAction({
        adminEmail,
        action: 'ADMIN_UPDATE_SYSTEM_SETTING',
        targetType: 'system_settings',
        targetId: String(key),
        ipAddress: clientIp,
        alertTitle: `Admin Updated system_settings.${key}`,
        severity: 'CRITICAL',
        metadata: { key: String(key), newValue: value, reason: String(reason).trim() },
        supabaseClient: supabase,
      });

      return NextResponse.json({ success: true, key, value });
    }

    // 7. Execute Verified Excess / Partial / Late Deposit Refund
    if (action === 'refund_excess_or_partial') {
      const { transactionId, amountNgn, reasonTag, typedConfirmation, reason } = body;
      if (!transactionId || !amountNgn || !reason) {
        return NextResponse.json(
          { success: false, error: 'transactionId, amountNgn, and reason are required.' },
          { status: 400 }
        );
      }

      const { data: rawTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();
      if (!rawTx) {
        return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
      }
      const tx = mergeTransactionWithLifecycleOverlay(rawTx);
      const amt = Number(amountNgn);

      const confirmCheck = await validateAdminTypedConfirmation({
        action: 'REFUND',
        transactionId: tx.id,
        amountNgn: amt,
        typedConfirmation,
      });
      if (!confirmCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            code: 'TYPED_CONFIRMATION_REQUIRED',
            error: confirmCheck.error,
            expectedPhrase: confirmCheck.expectedPhrase,
          },
          { status: 400 }
        );
      }

      const validTag = ['LATE_DEPOSIT_REFUND', 'PARTIAL_DEPOSIT_REFUND', 'EXCESS_DEPOSIT_REFUND'].includes(
        String(reasonTag)
      )
        ? (String(reasonTag) as any)
        : 'EXCESS_DEPOSIT_REFUND';

      const refundRes = await executeBuyerOrderRefund({
        tx,
        amountNgn: amt,
        reasonTag: validTag,
        targetStatus: validTag === 'PARTIAL_DEPOSIT_REFUND' ? 'REFUNDED' : null,
        referenceKey: `${validTag.toLowerCase()}_${tx.id}_${Date.now()}`,
        adminEmail,
        supabaseClient: supabase,
      });

      if (!refundRes.success) {
        return NextResponse.json({ success: false, error: refundRes.error }, { status: refundRes.statusCode });
      }

      await logAndAlertAdminAction({
        adminEmail,
        action: `ADMIN_${validTag}`,
        targetType: 'transaction',
        targetId: tx.id,
        ipAddress: clientIp,
        alertTitle: `Admin Executed ${validTag} (${tx.id.slice(0, 8)})`,
        severity: 'CRITICAL',
        metadata: { amountNgn: amt, transferId: refundRes.transferId, reason: String(reason).trim() },
        supabaseClient: supabase,
      });

      return NextResponse.json({ success: true, transferId: refundRes.transferId, amountNgn: amt });
    }

    return NextResponse.json({ success: false, error: `Unsupported admin action '${action}'.` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Admin action failed.' },
      { status: 500 }
    );
  }
}
