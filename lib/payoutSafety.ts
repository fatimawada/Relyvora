/**
 * Vendor Payout Safety:
 * - Legal-name vs settlement bank account fuzzy matching
 * - Anchor counterparty bank name enquiry verification
 * - WhatsApp-confirmed settlement account changes with mandatory 48h (configurable) payout hold
 * - Audit logging + ops alerting
 */

import { getServiceSupabase } from './supabaseServer';
import { createAnchorCounterParty } from './anchor';
import {
  getPayoutSafetyConfigServer,
  resolveAndValidateVendorServer,
} from './safetyLimits';
import { isSchemaMissingError, sendSettlementChangeConfirmWhatsapp } from './whatsapp';
import { sendSystemAlert } from './alerts';

const STRIP_NAME_TOKENS = new Set([
  'mr',
  'mrs',
  'miss',
  'ms',
  'dr',
  'prof',
  'chief',
  'alhaji',
  'alhaja',
  'pastor',
  'engr',
  'arc',
  'barr',
  'sir',
  'lady',
  'ltd',
  'limited',
  'plc',
  'inc',
  'llc',
  'ventures',
  'enterprise',
  'enterprises',
  'nigeria',
  'nig',
  'co',
]);

const globalForVendorOverlay = globalThis as unknown as {
  __relyvoraVendorSafetyOverlay?: Map<string, Record<string, any>>;
};

export function getVendorSafetyOverlayMap(): Map<string, Record<string, any>> {
  if (!globalForVendorOverlay.__relyvoraVendorSafetyOverlay) {
    globalForVendorOverlay.__relyvoraVendorSafetyOverlay = new Map();
  }
  return globalForVendorOverlay.__relyvoraVendorSafetyOverlay;
}

export function setVendorSafetyOverlay(vendorId: string, patch: Record<string, any>): void {
  const map = getVendorSafetyOverlayMap();
  const prev = map.get(vendorId) || {};
  map.set(vendorId, { ...prev, ...patch });
}

export function getVendorSafetyOverlay(vendorId: string): Record<string, any> | undefined {
  return getVendorSafetyOverlayMap().get(vendorId);
}

export function normalizeNameTokens(raw: string): string[] {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  const rawTokens = cleaned.split(' ').filter(Boolean);
  const filtered = rawTokens.filter((t) => !STRIP_NAME_TOKENS.has(t));
  return filtered.length > 0 ? filtered : rawTokens;
}

function getBigrams(str: string): Map<string, number> {
  const s = str.replace(/\s+/g, '');
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  return map;
}

function sorensenDice(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);
  let matches = 0;
  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) || 0;
    matches += Math.min(count1, count2);
  }
  return (2 * matches) / (s1.length - 1 + (s2.length - 1));
}

/**
 * Computes fuzzy similarity between two legal/bank account names (0.0 .. 1.0).
 * Handles reordered tokens ("Chinedu Okafor" vs "Okafor Chinedu Emmanuel"),
 * while guarding against common-first-name-only false positives ("Chinedu Okafor" vs "Chinedu Balogun").
 */
export function computeNameSimilarityScore(nameA: string, nameB: string): {
  score: number;
  tokenOverlap: number;
  diceScore: number;
  exactTokenSubset: boolean;
} {
  const tokensA = normalizeNameTokens(nameA);
  const tokensB = normalizeNameTokens(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0, tokenOverlap: 0, diceScore: 0, exactTokenSubset: false };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shorter = setA.size <= setB.size ? setA : setB;
  const longer = setA.size <= setB.size ? setB : setA;

  let matchedCount = 0;
  for (const tok of shorter) {
    if (longer.has(tok)) {
      matchedCount += 1;
    } else {
      // Fuzzy near-match per token (handles minor spelling typo like Okafor vs Okafar)
      for (const lTok of longer) {
        if (Math.min(tok.length, lTok.length) >= 4 && sorensenDice(tok, lTok) >= 0.85) {
          matchedCount += 0.9;
          break;
        }
      }
    }
  }

  const containment = matchedCount / shorter.size;
  const unionSize = new Set([...setA, ...setB]).size;
  const jaccard = matchedCount / unionSize;

  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');
  const diceScore = sorensenDice(sortedA, sortedB);
  const exactTokenSubset = containment >= 0.99;

  let score = Math.max(
    exactTokenSubset ? 0.88 + 0.12 * jaccard : 0,
    containment * 0.55 + diceScore * 0.35 + jaccard * 0.1
  );

  // Guard: if both names contain at least 2 words and only 1 word matches cleanly, prevent false match
  if (shorter.size >= 2 && matchedCount < 1.75 && diceScore < 0.78) {
    score = Math.min(score, 0.55);
  }

  return {
    score: Number(Math.min(1, Math.max(0, score)).toFixed(4)),
    tokenOverlap: Number(containment.toFixed(4)),
    diceScore: Number(diceScore.toFixed(4)),
    exactTokenSubset,
  };
}

export async function verifySettlementNameMatchesKyc(params: {
  legalFirstName?: string | null;
  legalLastName?: string | null;
  accountName?: string | null;
  minScoreOverride?: number;
}): Promise<{
  matched: boolean;
  score: number;
  minScoreRequired: number;
  kycFullName: string;
  accountName: string;
  reason?: string;
}> {
  const cfg = await getPayoutSafetyConfigServer();
  const minScoreRequired =
    typeof params.minScoreOverride === 'number'
      ? params.minScoreOverride
      : cfg.name_match_min_score;

  const kycFullName = [params.legalFirstName || '', params.legalLastName || '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const accountName = String(params.accountName || '').trim();

  if (!kycFullName || !accountName) {
    return {
      matched: false,
      score: 0,
      minScoreRequired,
      kycFullName,
      accountName,
      reason: 'Both KYC legal name and resolved settlement account name are required.',
    };
  }

  const sim = computeNameSimilarityScore(kycFullName, accountName);
  const matched = sim.score >= minScoreRequired;

  return {
    matched,
    score: sim.score,
    minScoreRequired,
    kycFullName,
    accountName,
    reason: matched
      ? undefined
      : `Settlement account name "${accountName}" does not match KYC legal name "${kycFullName}" (score ${sim.score} < ${minScoreRequired}).`,
  };
}

export async function performAnchorNameEnquiry(params: {
  bankCode: string;
  accountNumber: string;
  accountNameHint?: string | null;
}): Promise<{
  verified: boolean;
  resolvedAccountName: string | null;
  counterPartyId?: string;
  error?: string;
}> {
  const isLive = process.env.PAYMENTS_MODE === 'live';
  const hasAnchorKey = Boolean((process.env.ANCHOR_SECRET_KEY || '').trim());

  if (hasAnchorKey && process.env.ANCHOR_SKIP_LIVE_ENQUIRY !== 'true') {
    try {
      const cp = await createAnchorCounterParty({
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        accountName: params.accountNameHint || 'Name Enquiry Verification',
        verifyName: true,
      });
      const resolvedName =
        cp?.raw?.data?.attributes?.accountName || params.accountNameHint || null;
      return {
        verified: Boolean(resolvedName),
        resolvedAccountName: resolvedName,
        counterPartyId: cp?.counterPartyId,
      };
    } catch (err: any) {
      if (isLive) {
        return {
          verified: false,
          resolvedAccountName: null,
          error: err?.message || 'Anchor bank account name enquiry failed.',
        };
      }
      // In sandbox, fall through only if an explicit account name hint is supplied
    }
  }

  if (isLive) {
    return {
      verified: false,
      resolvedAccountName: null,
      error: 'ANCHOR_SECRET_KEY missing: cannot verify bank account name in live mode.',
    };
  }

  const fallbackName = String(params.accountNameHint || '').trim();
  if (!fallbackName) {
    return {
      verified: false,
      resolvedAccountName: null,
      error: 'Bank account name enquiry could not resolve an account holder name.',
    };
  }

  return {
    verified: true,
    resolvedAccountName: fallbackName,
  };
}

export async function checkVendorPayoutSafetyGate(params: {
  vendorId: string;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  allowed: boolean;
  reason?: string;
  code?: 'PAYOUT_ACCOUNT_UNVERIFIED' | 'NAME_MISMATCH' | 'SETTLEMENT_CHANGE_HOLD';
  payoutHoldUntil?: string | null;
}> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: dbVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const overlay = getVendorSafetyOverlay(params.vendorId) || {};
  const vendor = { ...(overlay || {}), ...(dbVendor || {}) };

  const payoutVerified =
    typeof vendor.payout_account_verified === 'boolean'
      ? vendor.payout_account_verified
      : typeof overlay.payout_account_verified === 'boolean'
        ? overlay.payout_account_verified
        : Boolean(vendor.settlement_account_number && vendor.settlement_bank_code);

  const nameMatched =
    typeof vendor.settlement_account_name_matched === 'boolean'
      ? vendor.settlement_account_name_matched
      : typeof overlay.settlement_account_name_matched === 'boolean'
        ? overlay.settlement_account_name_matched
        : true;

  if (!payoutVerified) {
    return {
      allowed: false,
      code: 'PAYOUT_ACCOUNT_UNVERIFIED',
      reason: 'Vendor settlement payout account has not been verified.',
    };
  }

  if (!nameMatched) {
    return {
      allowed: false,
      code: 'NAME_MISMATCH',
      reason: 'Vendor settlement account name does not match verified KYC legal name.',
    };
  }

  const holdUntilRaw = vendor.payout_hold_until || overlay.payout_hold_until || null;
  if (holdUntilRaw) {
    const holdUntilMs = new Date(holdUntilRaw).getTime();
    if (Number.isFinite(holdUntilMs) && holdUntilMs > Date.now()) {
      return {
        allowed: false,
        code: 'SETTLEMENT_CHANGE_HOLD',
        payoutHoldUntil: holdUntilRaw,
        reason: `Payouts are on a mandatory holding period until ${holdUntilRaw} following a settlement bank account change.`,
      };
    }
  }

  return { allowed: true };
}

export async function requestSettlementAccountChange(params: {
  vendorId: string;
  newBankCode: string;
  newAccountNumber: string;
  newAccountNameHint?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  success: boolean;
  statusCode: number;
  requiresWhatsappConfirmation?: boolean;
  whatsappStatus?: string;
  resolvedAccountName?: string;
  nameMatchScore?: number;
  waitHours?: number;
  payoutHoldUntil?: string | null;
  error?: string;
}> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const validation = await resolveAndValidateVendorServer({
    vendorIdOrHandle: params.vendorId,
    totalAmount: 0,
  });

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  if (!vendor) {
    return { success: false, statusCode: 404, error: 'Vendor account not found.' };
  }

  const enquiry = await performAnchorNameEnquiry({
    bankCode: params.newBankCode,
    accountNumber: params.newAccountNumber,
    accountNameHint: params.newAccountNameHint,
  });

  if (!enquiry.verified || !enquiry.resolvedAccountName) {
    return {
      success: false,
      statusCode: 422,
      error: enquiry.error || 'Could not resolve settlement bank account name.',
    };
  }

  const nameMatch = await verifySettlementNameMatchesKyc({
    legalFirstName: vendor.legal_first_name,
    legalLastName: vendor.legal_last_name,
    accountName: enquiry.resolvedAccountName,
  });

  if (!nameMatch.matched) {
    await sendSystemAlert({
      type: 'SETTLEMENT_CHANGE',
      severity: 'CRITICAL',
      title: 'Blocked Settlement Account Change Due to Name Mismatch',
      vendorHandle: vendor.store_name,
      details: {
        vendorId: vendor.id,
        kycName: nameMatch.kycFullName,
        attemptedAccountName: enquiry.resolvedAccountName,
        score: nameMatch.score,
        minScoreRequired: nameMatch.minScoreRequired,
      },
    }).catch(() => {});

    return {
      success: false,
      statusCode: 422,
      resolvedAccountName: enquiry.resolvedAccountName,
      nameMatchScore: nameMatch.score,
      error: nameMatch.reason,
    };
  }

  const safetyCfg = await getPayoutSafetyConfigServer();
  const now = new Date();
  const nowIso = now.toISOString();

  if (!safetyCfg.require_whatsapp_confirm_on_bank_change) {
    const holdUntilIso = new Date(
      now.getTime() + safetyCfg.settlement_change_wait_hours * 3600_000
    ).toISOString();

    const patch = {
      settlement_bank_code: params.newBankCode,
      settlement_account_number: params.newAccountNumber,
      settlement_account_name: enquiry.resolvedAccountName,
      payout_account_verified: true,
      settlement_account_name_matched: true,
      settlement_name_match_score: nameMatch.score,
      payout_hold_until: holdUntilIso,
      updated_at: nowIso,
    };

    const { error: updErr } = await supabase
      .from('vendors')
      .update(patch)
      .eq('id', vendor.id);

    if (updErr && isSchemaMissingError(updErr)) {
      await supabase
        .from('vendors')
        .update({
          settlement_bank_code: params.newBankCode,
          settlement_account_number: params.newAccountNumber,
          settlement_account_name: enquiry.resolvedAccountName,
          updated_at: nowIso,
        })
        .eq('id', vendor.id);
    }

    setVendorSafetyOverlay(vendor.id, patch);

    await supabase.from('admin_audit_log').insert({
      admin_email: params.actorEmail || vendor.email,
      action: 'VENDOR_SETTLEMENT_ACCOUNT_CHANGED',
      target_type: 'vendor',
      target_id: vendor.id,
      ip_address: params.ipAddress || null,
      metadata: {
        account_last4: params.newAccountNumber.slice(-4),
        bank_code: params.newBankCode,
        name_match_score: nameMatch.score,
        payout_hold_until: holdUntilIso,
        wait_hours: safetyCfg.settlement_change_wait_hours,
      },
      created_at: nowIso,
    });

    await sendSystemAlert({
      type: 'SETTLEMENT_CHANGE',
      severity: 'WARNING',
      title: 'Vendor Settlement Bank Account Updated (Payout Hold Active)',
      vendorHandle: vendor.store_name,
      details: {
        vendorId: vendor.id,
        accountLast4: params.newAccountNumber.slice(-4),
        bankCode: params.newBankCode,
        payoutHoldUntil: holdUntilIso,
      },
    }).catch(() => {});

    return {
      success: true,
      statusCode: 200,
      requiresWhatsappConfirmation: false,
      resolvedAccountName: enquiry.resolvedAccountName,
      nameMatchScore: nameMatch.score,
      waitHours: safetyCfg.settlement_change_wait_hours,
      payoutHoldUntil: holdUntilIso,
    };
  }

  // Require WhatsApp confirmation to vendor's registered/verified phone
  const pendingPatch = {
    pending_settlement_bank_code: params.newBankCode,
    pending_settlement_account_number: params.newAccountNumber,
    pending_settlement_account_name: enquiry.resolvedAccountName,
    pending_settlement_requested_at: nowIso,
    updated_at: nowIso,
  };

  const { error: pendingErr } = await supabase
    .from('vendors')
    .update(pendingPatch)
    .eq('id', vendor.id);

  if (pendingErr && !isSchemaMissingError(pendingErr)) {
    return {
      success: false,
      statusCode: 500,
      error: `Failed to stage pending settlement account change: ${pendingErr.message}`,
    };
  }

  setVendorSafetyOverlay(vendor.id, pendingPatch);

  const waRes = await sendSettlementChangeConfirmWhatsapp(
    {
      vendorId: vendor.id,
      vendorDisplayName: vendor.store_name,
      vendorPhone: vendor.phone_number,
      newAccountLast4: params.newAccountNumber.slice(-4),
      newBankCode: params.newBankCode,
      waitHours: safetyCfg.settlement_change_wait_hours,
    },
    supabase
  );

  await supabase.from('admin_audit_log').insert({
    admin_email: params.actorEmail || vendor.email,
    action: 'VENDOR_SETTLEMENT_CHANGE_REQUESTED',
    target_type: 'vendor',
    target_id: vendor.id,
    ip_address: params.ipAddress || null,
    metadata: {
      account_last4: params.newAccountNumber.slice(-4),
      bank_code: params.newBankCode,
      name_match_score: nameMatch.score,
      whatsapp_status: waRes.status,
      wait_hours: safetyCfg.settlement_change_wait_hours,
    },
    created_at: nowIso,
  });

  if (!validation.allowed && !vendor.anchor_deposit_account_id) {
    // Allow staged settlement changes for onboarding vendors, still return 202
  }

  return {
    success: true,
    statusCode: 202,
    requiresWhatsappConfirmation: true,
    whatsappStatus: waRes.status,
    resolvedAccountName: enquiry.resolvedAccountName,
    nameMatchScore: nameMatch.score,
    waitHours: safetyCfg.settlement_change_wait_hours,
  };
}

export async function confirmSettlementAccountChange(params: {
  vendorId: string;
  actorEmail?: string | null;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  success: boolean;
  statusCode: number;
  payoutHoldUntil?: string;
  error?: string;
}> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  if (!vendor) {
    return { success: false, statusCode: 404, error: 'Vendor account not found.' };
  }

  const overlay = getVendorSafetyOverlay(vendor.id) || {};
  const pendingBank = vendor.pending_settlement_bank_code || overlay.pending_settlement_bank_code;
  const pendingAcct = vendor.pending_settlement_account_number || overlay.pending_settlement_account_number;
  const pendingName = vendor.pending_settlement_account_name || overlay.pending_settlement_account_name;

  if (!pendingBank || !pendingAcct || !pendingName) {
    return {
      success: false,
      statusCode: 400,
      error: 'No pending settlement account change found for this vendor.',
    };
  }

  const safetyCfg = await getPayoutSafetyConfigServer();
  const now = new Date();
  const nowIso = now.toISOString();
  const holdUntilIso = new Date(
    now.getTime() + safetyCfg.settlement_change_wait_hours * 3600_000
  ).toISOString();

  const nameMatch = await verifySettlementNameMatchesKyc({
    legalFirstName: vendor.legal_first_name,
    legalLastName: vendor.legal_last_name,
    accountName: pendingName,
  });

  const confirmPatch = {
    settlement_bank_code: pendingBank,
    settlement_account_number: pendingAcct,
    settlement_account_name: pendingName,
    payout_account_verified: true,
    settlement_account_name_matched: nameMatch.matched,
    settlement_name_match_score: nameMatch.score,
    pending_settlement_bank_code: null,
    pending_settlement_account_number: null,
    pending_settlement_account_name: null,
    pending_settlement_confirmed_at: nowIso,
    payout_hold_until: holdUntilIso,
    updated_at: nowIso,
  };

  const { error: updErr } = await supabase
    .from('vendors')
    .update(confirmPatch)
    .eq('id', vendor.id);

  if (updErr && isSchemaMissingError(updErr)) {
    await supabase
      .from('vendors')
      .update({
        settlement_bank_code: pendingBank,
        settlement_account_number: pendingAcct,
        settlement_account_name: pendingName,
        updated_at: nowIso,
      })
      .eq('id', vendor.id);
  }

  setVendorSafetyOverlay(vendor.id, confirmPatch);

  await supabase.from('admin_audit_log').insert({
    admin_email: params.actorEmail || vendor.email,
    action: 'VENDOR_SETTLEMENT_CHANGE_CONFIRMED',
    target_type: 'vendor',
    target_id: vendor.id,
    ip_address: params.ipAddress || null,
    metadata: {
      account_last4: String(pendingAcct).slice(-4),
      bank_code: pendingBank,
      payout_hold_until: holdUntilIso,
      wait_hours: safetyCfg.settlement_change_wait_hours,
      name_match_score: nameMatch.score,
    },
    created_at: nowIso,
  });

  await sendSystemAlert({
    type: 'SETTLEMENT_CHANGE',
    severity: 'WARNING',
    title: 'Settlement Bank Change Confirmed — Mandatory Payout Hold Started',
    vendorHandle: vendor.store_name,
    details: {
      vendorId: vendor.id,
      accountLast4: String(pendingAcct).slice(-4),
      bankCode: pendingBank,
      payoutHoldUntil: holdUntilIso,
    },
  }).catch(() => {});

  return {
    success: true,
    statusCode: 200,
    payoutHoldUntil: holdUntilIso,
  };
}
