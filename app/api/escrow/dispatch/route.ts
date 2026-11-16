import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import {
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
  updateTransactionWithFallback,
} from '@/lib/orderLifecycle';
import {
  listOrderEvidenceRecords,
  uploadOrderEvidenceFile,
} from '@/lib/evidenceStorage';
import {
  normalizeWhatsappPhone,
  sendOrderDispatchedWhatsapp,
} from '@/lib/whatsapp';
import { logInfo } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      transactionId,
      carrierName,
      carrierPhone,
      trackingReference,
      dispatchNotes,
      proofFile,
    } = body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Optional vendor session ownership check (if vendor is signed in, enforce vendor ownership & non-suspended status)
    const vendorSession = await verifyVendorOnboardingSession(request).catch(() => ({ authorized: false } as any));
    if (vendorSession?.authorized && vendorSession?.user?.id) {
      const { data: vRow } = await supabase
        .from('vendors')
        .select('id, is_suspended')
        .eq('user_id', vendorSession.user.id)
        .maybeSingle();
      if (vRow?.is_suspended) {
        return NextResponse.json(
          { success: false, code: 'VENDOR_SUSPENDED', error: 'Suspended vendors cannot mark orders dispatched.' },
          { status: 403 }
        );
      }
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    const merged = mergeTransactionWithLifecycleOverlay(existing);

    if (merged.status !== 'FUNDS_LOCKED') {
      return NextResponse.json(
        { success: false, error: `Cannot dispatch: order is in status '${merged.status}', expected 'FUNDS_LOCKED'.` },
        { status: 400 }
      );
    }

    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const deliveryType = merged.delivery_type === 'interstate' ? 'interstate' : 'same_city';

    const cleanCarrier = typeof carrierName === 'string' ? carrierName.trim() : '';
    const cleanPhone = typeof carrierPhone === 'string' ? carrierPhone.trim() : '';
    const cleanTracking = typeof trackingReference === 'string' ? trackingReference.trim() : '';
    const cleanNotes = typeof dispatchNotes === 'string' ? dispatchNotes.trim() : '';

    if (cfg.dispatchProof.require_courier_name && !cleanCarrier) {
      return NextResponse.json(
        { success: false, error: 'Courier / dispatch rider name is required.' },
        { status: 400 }
      );
    }

    if (cfg.dispatchProof.require_courier_phone && !cleanPhone) {
      return NextResponse.json(
        { success: false, error: 'Courier / dispatch rider phone number is required.' },
        { status: 400 }
      );
    }

    if (deliveryType === 'interstate' && cfg.dispatchProof.require_tracking_for_interstate && !cleanTracking) {
      return NextResponse.json(
        { success: false, error: 'Waybill or tracking number is required for interstate orders.' },
        { status: 400 }
      );
    }

    let uploadedRecord = null;
    if (proofFile && typeof proofFile === 'object' && proofFile.base64Data) {
      const b64 = String(proofFile.base64Data).replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      const up = await uploadOrderEvidenceFile({
        transactionId,
        uploadedByRole: 'VENDOR',
        evidenceCategory: 'DISPATCH_PROOF',
        fileBuffer: buf,
        mimeType: String(proofFile.mimeType || ''),
        originalFilename: proofFile.fileName || 'dispatch-proof',
        description: proofFile.description || 'Vendor dispatch proof',
        supabaseClient: supabase,
      });
      if (!up.success || !up.record) {
        return NextResponse.json({ success: false, error: up.error || 'Invalid dispatch proof file.' }, { status: 400 });
      }
      uploadedRecord = up.record;
    }

    const existingEvidence = await listOrderEvidenceRecords(transactionId, supabase);
    const dispatchProofCount = existingEvidence.filter((f) => f.evidence_category === 'DISPATCH_PROOF').length;

    if (cfg.dispatchProof.require_upload && dispatchProofCount < 1) {
      return NextResponse.json(
        {
          success: false,
          code: 'DISPATCH_PROOF_REQUIRED',
          error: 'Proof of dispatch photo, waybill, or video upload is required before marking dispatched.',
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const normalizedCourierPhone = normalizeWhatsappPhone(cleanPhone) || cleanPhone || null;

    const upd = await updateTransactionWithFallback(
      transactionId,
      {
        status: 'DISPATCHED',
        dispatched_at: now,
        courier_name: cleanCarrier || null,
        courier_phone: normalizedCourierPhone,
        tracking_number: cleanTracking || null,
        dispatch_notes: cleanNotes || null,
        dispatch_proof_count: dispatchProofCount,
        updated_at: now,
      },
      supabase
    );

    if (!upd.success) {
      return NextResponse.json({ success: false, error: upd.error || 'Failed to update dispatch state.' }, { status: 500 });
    }

    // Notify buyer on WhatsApp cleanly (non-blocking)
    if (merged.buyer_phone) {
      await sendOrderDispatchedWhatsapp(
        {
          transactionId,
          buyerPhone: merged.buyer_phone,
          vendorDisplayName: merged.vendor_handle || 'Relyvora Vendor',
          itemName: merged.item_name || 'Escrow Order',
          courierLabel: cleanCarrier || 'Dispatch Rider',
          trackingRef: cleanTracking || transactionId.slice(0, 8),
          vendorId: merged.vendor_id,
        },
        supabase
      ).catch(() => {});
    }

    logInfo('ORDER_MARKED_DISPATCHED', {
      transactionId,
      deliveryType,
      dispatchProofCount,
      hasTracking: Boolean(cleanTracking),
    });

    const updatedTransaction = mergeTransactionWithLifecycleOverlay({
      ...merged,
      status: 'DISPATCHED',
      dispatched_at: now,
      courier_name: cleanCarrier || null,
      courier_phone: normalizedCourierPhone,
      tracking_number: cleanTracking || null,
      dispatch_notes: cleanNotes || null,
      dispatch_proof_count: dispatchProofCount,
      updated_at: now,
    });

    return NextResponse.json({
      success: true,
      transaction: updatedTransaction,
      proofRecord: uploadedRecord,
      dispatchProofCount,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
