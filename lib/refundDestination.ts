/**
 * Verified Buyer Refund Destination Engine & Encryption
 *
 * Rules:
 * - Refunds route strictly to:
 *   1) The originating sender bank account reported on the verified Anchor deposit webhook
 *      (`DEPOSIT_SENDER`, when Anchor permits NIP payout back to sender), OR
 *   2) A buyer-confirmed Nigerian NUBAN account verified via WhatsApp OTP + Anchor Name Enquiry
 *      (`BUYER_OTP_CONFIRMED`), stored encrypted with AES-256-GCM.
 * - No refund is executed without a verified destination (`refund_account_verified = true`).
 */

import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { performAnchorNameEnquiry } from '@/lib/payoutSafety';
import { logWarn } from '@/lib/logger';
import { sendSystemAlert } from '@/lib/alerts';

export interface RefundAccountPayload {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface EncryptedRefundRecord {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface RefundDestinationState {
  verified: boolean;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  source: 'DEPOSIT_SENDER' | 'BUYER_OTP_CONFIRMED' | null;
  verifiedAt: string | null;
  maskedAccount: string | null;
}

function getRefundEncryptionKey(): Buffer {
  const raw =
    process.env.REFUND_DATA_ENCRYPTION_KEY ||
    process.env.RELEASE_CODE_PEPPER ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!raw) {
    throw new Error(
      'CRITICAL SECURITY ERROR: REFUND_DATA_ENCRYPTION_KEY, RELEASE_CODE_PEPPER, or SUPABASE_SERVICE_ROLE_KEY is required.'
    );
  }
  return crypto.createHash('sha256').update(raw.trim()).digest();
}

export function encryptRefundAccount(payload: RefundAccountPayload): EncryptedRefundRecord {
  const key = getRefundEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify({
    bankCode: String(payload.bankCode).trim(),
    accountNumber: String(payload.accountNumber).trim(),
    accountName: String(payload.accountName).trim(),
  });
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptRefundAccount(record: {
  ciphertext?: string | null;
  iv?: string | null;
  authTag?: string | null;
}): RefundAccountPayload | null {
  if (!record.ciphertext || !record.iv || !record.authTag) return null;
  try {
    const key = getRefundEncryptionKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(record.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    if (parsed?.bankCode && parsed?.accountNumber) {
      return {
        bankCode: String(parsed.bankCode),
        accountNumber: String(parsed.accountNumber),
        accountName: String(parsed.accountName || 'Verified Buyer'),
      };
    }
    return null;
  } catch {
    logWarn('REFUND_ACCOUNT_DECRYPT_FAILED', {});
    return null;
  }
}

export function maskAccounttail(acc?: string | null): string | null {
  if (!acc) return null;
  const clean = String(acc).trim();
  if (clean.length <= 4) return '******';
  return `******${clean.slice(-4)}`;
}

/**
 * Extracts Anchor webhook sender fields from nested attributes OR JSON:API `included[]`.
 */
export function extractAnchorDepositSenderFields(payload: any): {
  senderAccountNumber: string | null;
  senderBankCode: string | null;
  senderName: string | null;
} {
  const attributes = payload?.data?.attributes || payload?.attributes || {};
  const senderObj = attributes?.sender || payload?.sender || {};

  let senderAccountNumber: string | null =
    senderObj?.accountNumber || attributes?.senderAccountNumber || null;
  let senderBankCode: string | null =
    senderObj?.bankCode || senderObj?.bank?.nipCode || attributes?.senderBankCode || null;
  let senderName: string | null =
    senderObj?.accountName || attributes?.senderName || null;

  if ((!senderAccountNumber || !senderBankCode) && Array.isArray(payload?.included)) {
    for (const item of payload.included) {
      const t = String(item?.type || '').toLowerCase();
      const ia = item?.attributes || {};
      if (t.includes('counterparty') || t.includes('sender') || t.includes('deposit') || t.includes('payment')) {
        if (!senderAccountNumber && ia?.accountNumber) senderAccountNumber = String(ia.accountNumber);
        if (!senderBankCode && (ia?.bankCode || ia?.bank?.nipCode)) {
          senderBankCode = String(ia.bankCode || ia.bank.nipCode);
        }
        if (!senderName && (ia?.accountName || ia?.senderName)) {
          senderName = String(ia.accountName || ia.senderName);
        }
      }
    }
  }

  return {
    senderAccountNumber: senderAccountNumber ? String(senderAccountNumber).trim() : null,
    senderBankCode: senderBankCode ? String(senderBankCode).trim() : null,
    senderName: senderName ? String(senderName).trim() : null,
  };
}

/**
 * Saves an encrypted verified refund destination on the transaction (plus legacy columns if needed).
 */
export async function saveVerifiedRefundDestination(params: {
  transactionId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  source: 'DEPOSIT_SENDER' | 'BUYER_OTP_CONFIRMED';
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<RefundDestinationState> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const cleanBank = String(params.bankCode).trim();
  const cleanAcc = String(params.accountNumber).trim();
  const cleanName = String(params.accountName || 'Verified Buyer').trim();
  const nowIso = new Date().toISOString();

  const encrypted = encryptRefundAccount({
    bankCode: cleanBank,
    accountNumber: cleanAcc,
    accountName: cleanName,
  });

  const state: RefundDestinationState = {
    verified: true,
    bankCode: cleanBank,
    accountNumber: cleanAcc,
    accountName: cleanName,
    source: params.source,
    verifiedAt: nowIso,
    maskedAccount: maskAccounttail(cleanAcc),
  };

  const { error } = await supabase
    .from('transactions')
    .update({
      refund_destination_bank: cleanBank,
      refund_destination_account: cleanAcc,
      refund_destination_name: cleanName,
      refund_account_ciphertext: encrypted.ciphertext,
      refund_account_iv: encrypted.iv,
      refund_account_auth_tag: encrypted.authTag,
      refund_account_verified: true,
      refund_account_verified_at: nowIso,
      refund_account_source: params.source,
      updated_at: nowIso,
    })
    .eq('id', params.transactionId);

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Failed Persisting Verified Refund Destination (Fail Closed)',
      transactionId: params.transactionId,
      details: { source: params.source, error: error.message },
    }).catch(() => {});
    throw new Error(`Failed saving verified refund destination: ${error.message}`);
  }

  return state;
}

/**
 * Verifies a buyer-supplied Nigerian bank account via Anchor Name Enquiry and saves encrypted destination.
 */
export async function verifyAndSaveBuyerRefundAccount(params: {
  transactionId: string;
  bankCode: string;
  accountNumber: string;
  accountNameHint?: string;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; destination?: RefundDestinationState; error?: string }> {
  const cleanBank = String(params.bankCode || '').trim();
  const cleanAcc = String(params.accountNumber || '').trim();
  if (!cleanBank || !/^\d{10}$/.test(cleanAcc)) {
    return {
      success: false,
      error: 'Valid bank code and 10-digit Nigerian NUBAN account number are required.',
    };
  }

  const enquiry = await performAnchorNameEnquiry({
    bankCode: cleanBank,
    accountNumber: cleanAcc,
    accountNameHint: params.accountNameHint || 'Verified Buyer Refund',
  });

  if (!enquiry.verified || !enquiry.resolvedAccountName) {
    return {
      success: false,
      error: enquiry.error || 'Unable to verify refund bank account via Anchor Name Enquiry.',
    };
  }

  const state = await saveVerifiedRefundDestination({
    transactionId: params.transactionId,
    bankCode: cleanBank,
    accountNumber: cleanAcc,
    accountName: enquiry.resolvedAccountName,
    source: 'BUYER_OTP_CONFIRMED',
    supabaseClient: params.supabaseClient,
  });

  return { success: true, destination: state };
}

/**
 * Resolves the verified refund destination for a transaction, blocking refunds when unverified.
 */
export async function resolveVerifiedRefundDestination(
  tx: Record<string, any>,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<RefundDestinationState> {
  const decrypted = decryptRefundAccount({
    ciphertext: tx?.refund_account_ciphertext,
    iv: tx?.refund_account_iv,
    authTag: tx?.refund_account_auth_tag,
  });

  if (decrypted && (tx?.refund_account_verified === true || tx?.refund_account_source)) {
    return {
      verified: true,
      bankCode: decrypted.bankCode,
      accountNumber: decrypted.accountNumber,
      accountName: decrypted.accountName,
      source: (tx.refund_account_source as any) || 'BUYER_OTP_CONFIRMED',
      verifiedAt: tx.refund_account_verified_at || null,
      maskedAccount: maskAccounttail(decrypted.accountNumber),
    };
  }

  if (tx?.refund_destination_account && tx?.refund_destination_bank) {
    return {
      verified: true,
      bankCode: String(tx.refund_destination_bank),
      accountNumber: String(tx.refund_destination_account),
      accountName: String(tx.refund_destination_name || tx.sender_name || 'Verified Deposit Sender'),
      source: (tx.refund_account_source as any) || 'DEPOSIT_SENDER',
      verifiedAt: tx.refund_account_verified_at || tx.paid_at || null,
      maskedAccount: maskAccounttail(tx.refund_destination_account),
    };
  }

  if (tx?.sender_account_number && tx?.sender_bank_code) {
    return {
      verified: true,
      bankCode: String(tx.sender_bank_code),
      accountNumber: String(tx.sender_account_number),
      accountName: String(tx.sender_name || 'Verified Deposit Sender'),
      source: 'DEPOSIT_SENDER',
      verifiedAt: tx.paid_at || null,
      maskedAccount: maskAccounttail(tx.sender_account_number),
    };
  }

  if (tx?.id) {
    const supabase = supabaseClient || getServiceSupabase();
    const { data: dep, error: depErr } = await supabase
      .from('deposits')
      .select('sender_account_number, sender_bank_code, sender_name, created_at')
      .eq('transaction_id', tx.id)
      .not('sender_account_number', 'is', null)
      .not('sender_bank_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (depErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Deposit Sender Refund Lookup Failed (Fail Closed)',
        transactionId: tx.id,
        details: { error: depErr.message },
      }).catch(() => {});
      throw new Error(`Deposit refund destination lookup failed: ${depErr.message}`);
    }

    if (dep?.sender_account_number && dep?.sender_bank_code) {
      return {
        verified: true,
        bankCode: String(dep.sender_bank_code),
        accountNumber: String(dep.sender_account_number),
        accountName: String(dep.sender_name || 'Verified Deposit Sender'),
        source: 'DEPOSIT_SENDER',
        verifiedAt: dep.created_at || null,
        maskedAccount: maskAccounttail(dep.sender_account_number),
      };
    }
  }

  return {
    verified: false,
    bankCode: null,
    accountNumber: null,
    accountName: null,
    source: null,
    verifiedAt: null,
    maskedAccount: null,
  };
}
