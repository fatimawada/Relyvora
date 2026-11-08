import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isLiveMode } from '@/lib/paymentsMode';
import { verifyReleaseCode, MAX_CODE_ATTEMPTS } from '@/lib/releaseCode';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';
import { 
  releaseEscrowFunds, 
  RELYVORA_FBO_ACCOUNT_ID, 
  RELYVORA_REVENUE_ACCOUNT_ID,
  AnchorApiError 
} from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, releaseCode } = body;

    if (!transactionId || !releaseCode || typeof releaseCode !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transactionId and 6-digit releaseCode are required.' },
        { status: 400 }
      );
    }

    const cleanCode = releaseCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return NextResponse.json(
        { success: false, error: 'Release code must be exactly 6 digits.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    // 1. Fetch current transaction record
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // 2. State & Dispute checks
    if (existing.status === 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: 'Transaction is in dispute. Release code verification is disabled.' },
        { status: 400 }
      );
    }

    if (existing.status === 'RELEASED') {
      return NextResponse.json(
        { success: false, error: 'Transaction funds have already been released.' },
        { status: 400 }
      );
    }

    if (existing.status !== 'DISPATCHED' && existing.status !== 'FUNDS_LOCKED') {
      return NextResponse.json(
        { success: false, error: `Cannot release: transaction status is '${existing.status}'.` },
        { status: 400 }
      );
    }

    // 3. Brute-Force Lockout check (Max 5 attempts)
    const currentAttempts = Number(existing.failed_code_attempts) || 0;
    if (existing.code_locked || currentAttempts >= MAX_CODE_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Release verification is locked due to ${MAX_CODE_ATTEMPTS} failed attempts. Please contact Relyvora support.`,
          isLocked: true,
          attemptsRemaining: 0,
        },
        { status: 423 }
      );
    }

    // 4. Verify release code securely
    let isValid = false;

    if (existing.release_code_hash && existing.release_code_salt) {
      isValid = verifyReleaseCode(cleanCode, existing.release_code_salt, existing.release_code_hash);
    } else if (existing.release_code) {
      // Legacy fallback for sandbox records created before hashing migration
      isValid = cleanCode === existing.release_code.trim();
    }

    const now = new Date().toISOString();

    // 5. Handle Incorrect Code
    if (!isValid) {
      const newAttempts = currentAttempts + 1;
      const isNowLocked = newAttempts >= MAX_CODE_ATTEMPTS;

      await supabase
        .from('transactions')
        .update({
          failed_code_attempts: newAttempts,
          code_locked: isNowLocked,
          code_locked_at: isNowLocked ? now : null,
          updated_at: now,
        })
        .eq('id', transactionId);

      if (isNowLocked) {
        sendSystemAlert({
          type: 'SECURITY_LOCKOUT',
          severity: 'CRITICAL',
          title: 'Brute-Force Lockout Activated (5 Failed Attempts)',
          transactionId,
          vendorHandle: existing.vendor_handle,
          details: {
            failedAttempts: newAttempts,
            lockedAt: now,
          },
        }).catch(() => {});
      }

      return NextResponse.json(
        {
          success: false,
          error: isNowLocked
            ? `Invalid release code. Maximum attempts reached (${MAX_CODE_ATTEMPTS}/${MAX_CODE_ATTEMPTS}). Transaction is now locked.`
            : 'Invalid 6-digit release code. Please confirm with the buyer.',
          attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - newAttempts),
          isLocked: isNowLocked,
        },
        { status: 400 }
      );
    }

    // 6. Valid Code! Execute Settlement
    let anchorTransferId: string | null = null;
    let anchorRevenueTransferId: string | null = null;

    if (isLiveMode()) {
      try {
        // Look up vendor anchor deposit account
        const vendorWalletId = existing.vendor_anchor_account_id || process.env.ANCHOR_SETTLEMENT_ACCOUNT_ID;
        if (!vendorWalletId) {
          return NextResponse.json(
            { success: false, error: 'Vendor has not linked a valid Anchor payout deposit account.' },
            { status: 422 }
          );
        }

        const totalAmountNaira = Number(existing.total_amount) || 0;

        const splitResult = await releaseEscrowFunds(
          RELYVORA_FBO_ACCOUNT_ID,
          vendorWalletId,
          RELYVORA_REVENUE_ACCOUNT_ID,
          totalAmountNaira,
          {
            isKobo: false,
            referencePrefix: `rv_live_${existing.id.slice(0, 8)}`,
          }
        );

        anchorTransferId = splitResult.vendorTransfer.transferId;
        anchorRevenueTransferId = splitResult.revenueTransfer.transferId;
      } catch (anchorErr: any) {
        console.error('Anchor escrow split transfer failure:', anchorErr);
        sendSystemAlert({
          type: 'PAYOUT_FAILURE',
          severity: 'CRITICAL',
          title: 'Anchor Escrow Settlement BookTransfer Failed',
          transactionId,
          vendorHandle: existing.vendor_handle,
          details: {
            errorMessage: anchorErr.message,
            totalAmount: existing.total_amount,
          },
        }).catch(() => {});

        // Do not mark RELEASED if live banking transfer failed!
        return NextResponse.json(
          {
            success: false,
            error: 'Verified code successfully, but failed to settle banking ledger transfer: ' + anchorErr.message,
          },
          { status: 502 }
        );
      }
    }

    // 7. Atomically commit RELEASED status in database
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'RELEASED',
        released_at: now,
        failed_code_attempts: 0,
        code_locked: false,
        anchor_transfer_id: anchorTransferId,
        anchor_revenue_transfer_id: anchorRevenueTransferId,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      console.error('Failed to update status to RELEASED:', updateErr);
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // Phase G2: Record immutable ledger entries for vendor payout and platform fee
    const vendorPayout = Number(existing.item_price) || 0;
    const platformFee = Number(existing.protection_fee) || 0;

    await recordLedgerEntry({
      transactionId,
      entryType: 'PAYOUT_VENDOR',
      amount: vendorPayout,
      currency: 'NGN',
      fromAccount: 'Relyvora Escrow FBO',
      toAccount: `Vendor (${existing.vendor_handle})`,
      anchorTransferId,
      idempotencyKey: `ledger_${transactionId}_PAYOUT_VENDOR`,
      metadata: { vendorHandle: existing.vendor_handle },
    });

    await recordLedgerEntry({
      transactionId,
      entryType: 'FEE_REVENUE',
      amount: platformFee,
      currency: 'NGN',
      fromAccount: 'Relyvora Escrow FBO',
      toAccount: 'Relyvora Revenue Account',
      anchorTransferId: anchorRevenueTransferId,
      idempotencyKey: `ledger_${transactionId}_FEE_REVENUE`,
      metadata: { feeFloorApplied: platformFee === 500 },
    });

    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    console.error('Unhandled error in release route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
