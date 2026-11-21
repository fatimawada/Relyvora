import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import { isLiveMode } from '@/lib/paymentsMode';
import { getHotSettings, requireHotSetting } from '@/lib/safetyLimits';
import { logError, logWarn } from '@/lib/logger';
import { resolveNigerianBankName } from '@/lib/nigerianBanks';

export type WhatsappDeliveryStatus =
  | 'not_sent'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export type WhatsappDncReason = 'NOT_ME' | 'STOP_REPLY' | 'MANUAL';

export interface WhatsappTemplateDefinition {
  name: string;
  category: 'UTILITY' | 'AUTHENTICATION';
  language: string;
  messageSendTtlSeconds?: number;
  addSecurityRecommendation?: boolean;
  codeExpirationMinutes?: number | null;
  bodyText: string;
  footerText?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'OTP';
    otpType?: 'COPY_CODE';
    text: string;
    urlExample?: string;
  }>;
}

export const WHATSAPP_TEMPLATES: Record<
  | 'payment_link_v1'
  | 'release_code_v1'
  | 'order_dispatched_v1'
  | 'delivery_reminder_v1'
  | 'dispute_opened_v1'
  | 'verification_otp_v1'
  | 'vendor_phone_verify_v1'
  | 'settlement_change_confirm_v1'
  | 'payout_cooling_notice_v1',
  WhatsappTemplateDefinition
> = {
  payment_link_v1: {
    name: 'payment_link_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Hello. {{1}} has created a payment link on Relyvora for {{2}} (₦{{3}}). Your payment is securely held until your order is delivered. Tap Continue to open your payment page.',
    footerText: 'Secured by Relyvora Escrow',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Continue' },
      { type: 'QUICK_REPLY', text: 'Not my order' },
      {
        type: 'URL',
        text: 'Open payment page',
        urlExample: 'https://ng.relyvora.com/pay/{{1}}',
      },
    ],
  },
  release_code_v1: {
    name: 'release_code_v1',
    category: 'AUTHENTICATION',
    language: 'en',
    messageSendTtlSeconds: -1, // 30-day Meta max TTL (prevents 10-minute default drop on offline Nigerian phones)
    addSecurityRecommendation: false,
    codeExpirationMinutes: null,
    bodyText: '{{1}} is your verification code.',
    buttons: [
      {
        type: 'OTP',
        otpType: 'COPY_CODE',
        text: 'Copy code',
      },
    ],
  },
  order_dispatched_v1: {
    name: 'order_dispatched_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Good news: {{1}} marked your order {{2}} (Ref: {{3}}) as dispatched with {{4}}. Please inspect your package carefully on arrival before finalizing order handover on Relyvora.',
    buttons: [
      {
        type: 'URL',
        text: 'Track Order',
        urlExample: 'https://ng.relyvora.com/order/{{1}}',
      },
    ],
  },
  delivery_reminder_v1: {
    name: 'delivery_reminder_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Reminder for {{1}} from {{2}}: your delivery inspection window ends in {{3}}. If your order arrived intact, complete handover with the rider; if anything is wrong or missing, open your order page immediately.',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Report Problem' },
      {
        type: 'URL',
        text: 'View Order',
        urlExample: 'https://ng.relyvora.com/order/{{1}}',
      },
    ],
  },
  dispute_opened_v1: {
    name: 'dispute_opened_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Relyvora escrow update for {{1}}: {{2}}. Please review the timeline and submit any response or evidence on your order page before {{3}}.',
    buttons: [
      {
        type: 'URL',
        text: 'Open Dispute View',
        urlExample: 'https://ng.relyvora.com/order/{{1}}',
      },
    ],
  },
  verification_otp_v1: {
    name: 'verification_otp_v1',
    category: 'AUTHENTICATION',
    language: 'en',
    addSecurityRecommendation: false,
    codeExpirationMinutes: null,
    bodyText: '{{1}} is your verification code.',
    buttons: [
      {
        type: 'OTP',
        otpType: 'COPY_CODE',
        text: 'Copy code',
      },
    ],
  },
  vendor_phone_verify_v1: {
    name: 'vendor_phone_verify_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Hello {{1}}, please tap below to link this WhatsApp number to your Relyvora merchant account ({{2}}).',
    buttons: [{ type: 'QUICK_REPLY', text: 'Yes, this is my number' }],
  },
  settlement_change_confirm_v1: {
    name: 'settlement_change_confirm_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Account update notice for {{1}}: A request was submitted to update your Relyvora payout bank account to the account ending in {{2}} at {{3}}. Tap Approve bank change below if you requested this; payouts will pause for {{4}} hours once approved.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Approve bank change' }],
  },
  payout_cooling_notice_v1: {
    name: 'payout_cooling_notice_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Handover update for {{1}} ({{2}}): Order completion was submitted. For your protection, payout is held for {{3}} hours until {{4}}. Tap Problem below immediately if anything is wrong with your item.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Problem' }],
  },
};

export interface MetaTemplatePayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: Array<Record<string, unknown>>;
  };
}

export interface WhatsappTransportResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  status?: 'queued' | 'sent' | 'failed';
}

interface GlobalWhatsappStore {
  recentPayloadsByWamid?: Map<
    string,
    {
      payload: MetaTemplatePayload;
      templateName: string;
      transactionId?: string;
      retryCount?: number;
      storedAt?: number;
    }
  >;
}

const globalForWhatsapp = globalThis as unknown as {
  __relyvoraWhatsappStore?: GlobalWhatsappStore;
};

function getWhatsappStore(): GlobalWhatsappStore {
  if (!globalForWhatsapp.__relyvoraWhatsappStore) {
    globalForWhatsapp.__relyvoraWhatsappStore = {
      recentPayloadsByWamid: new Map(),
    };
  }
  if (!globalForWhatsapp.__relyvoraWhatsappStore.recentPayloadsByWamid) {
    globalForWhatsapp.__relyvoraWhatsappStore.recentPayloadsByWamid = new Map();
  }
  return globalForWhatsapp.__relyvoraWhatsappStore;
}

/**
 * Normalizes Nigerian and international phone strings into strict E.164 format (+234...).
 */
export function normalizeWhatsappPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('234') && digits.length >= 13) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10 && (digits.startsWith('7') || digits.startsWith('8') || digits.startsWith('9'))) {
    return `+234${digits}`;
  }
  if (trimmed.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Masks a phone number showing only the last 4 digits (e.g. ******1234).
 */
export function maskWhatsappNumber(phone?: string | null): string {
  if (!phone) return '******';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '******';
  return `******${digits.slice(-4)}`;
}

/**
 * Computes an irreversible HMAC-SHA256 digest for storing DNC / rate-limit keys without plaintext phones.
 */
export function hashWhatsappPhone(e164Phone: string): string {
  const pepper =
    process.env.WHATSAPP_PHONE_PEPPER ||
    process.env.RELEASE_CODE_PEPPER ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'relyvora_default_phone_pepper_v1';
  return crypto.createHmac('sha256', pepper).update(e164Phone).digest('hex');
}

export function getPayBaseUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl.startsWith('https://')) {
    return appUrl;
  }
  if (process.env.VERCEL_ENV === 'production') {
    return 'https://ng.relyvora.com';
  }
  return 'https://staging.relyvora.com';
}

export function formatNumberForTemplate(amount: number): string {
  const numeric = Number(amount) || 0;
  return numeric.toLocaleString('en-NG', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatNairaForTemplate(amount: number): string {
  return `₦${formatNumberForTemplate(amount)}`;
}

/**
 * Checks in-memory + Supabase DNC registry for a normalized E.164 phone number.
 */
export async function isPhoneOnDoNotContact(
  e164Phone: string,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ blocked: boolean; reason?: string }> {
  const phoneHash = hashWhatsappPhone(e164Phone);
  const supabase = supabaseClient || getServiceSupabase();
  const { data, error } = await supabase
    .from('whatsapp_do_not_contact')
    .select('reason')
    .eq('phone_hash', phoneHash)
    .maybeSingle();

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp DNC Registry Lookup Failed (Fail Closed)',
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`WhatsApp DNC lookup failed: ${error.message}`);
  }

  if (data?.reason) {
    return { blocked: true, reason: data.reason };
  }
  return { blocked: false };
}

/**
 * Adds a phone number (stored strictly as HMAC hash + masked tail) to the DNC registry.
 */
export async function addPhoneToDoNotContact(
  params: {
    phone: string;
    reason: WhatsappDncReason;
    transactionId?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const e164 = normalizeWhatsappPhone(params.phone);
  if (!e164) return;
  const phoneHash = hashWhatsappPhone(e164);
  const maskedPhone = maskWhatsappNumber(e164);
  const now = new Date().toISOString();

  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase
    .from('whatsapp_do_not_contact')
    .upsert(
      {
        phone_hash: phoneHash,
        masked_phone: maskedPhone,
        reason: params.reason,
        source_transaction_id: params.transactionId || null,
        created_at: now,
      },
      { onConflict: 'phone_hash' }
    );

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp DNC Registry Insert Failed (Fail Closed)',
      transactionId: params.transactionId || undefined,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`WhatsApp DNC insert failed: ${error.message}`);
  }
}

export async function getWhatsappDailyLimits(
  _supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ maxVendorDaily: number; maxBuyerDaily: number }> {
  const settings = await getHotSettings();
  const maxVendorRaw = await requireHotSetting(settings, 'max_daily_vendor_whatsapp_messages');
  const maxBuyerRaw = await requireHotSetting(settings, 'max_daily_buyer_whatsapp_messages');
  const maxVendorDaily = Number(maxVendorRaw);
  const maxBuyerDaily = Number(maxBuyerRaw);
  if (!Number.isFinite(maxVendorDaily) || maxVendorDaily <= 0 || !Number.isFinite(maxBuyerDaily) || maxBuyerDaily <= 0) {
    throw new Error('Invalid WhatsApp daily cap settings in system_settings.');
  }
  return { maxVendorDaily, maxBuyerDaily };
}

export interface WhatsappRecipientFilterStatus {
  environment: 'production' | 'staging';
  state:
    | 'unset'
    | 'empty'
    | 'enforced'
    | 'invalid_nonempty'
    | 'set_ignored_in_production';
  enforced: boolean;
  configuredCount: number;
  allowedNumbers: string[];
}

export function getWhatsappRecipientFilterStatus(
  env: Record<string, string | undefined> = process.env
): WhatsappRecipientFilterStatus {
  const isProduction = env.VERCEL_ENV === 'production';
  const rawValue = env.WHATSAPP_ALLOWED_RECIPIENTS;

  if (rawValue === undefined) {
    return {
      environment: isProduction ? 'production' : 'staging',
      state: 'unset',
      enforced: false,
      configuredCount: 0,
      allowedNumbers: [],
    };
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return {
      environment: isProduction ? 'production' : 'staging',
      state: 'empty',
      enforced: false,
      configuredCount: 0,
      allowedNumbers: [],
    };
  }

  const rawEntries = trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalizedAllowed = rawEntries
    .map((entry) => normalizeWhatsappPhone(entry))
    .filter((p): p is string => Boolean(p));

  if (isProduction) {
    // CRITICAL INVARIANT: Production must NEVER silently block real customer WhatsApp messages.
    return {
      environment: 'production',
      state: 'set_ignored_in_production',
      enforced: false,
      configuredCount: rawEntries.length,
      allowedNumbers: normalizedAllowed,
    };
  }

  if (normalizedAllowed.length === 0) {
    return {
      environment: 'staging',
      state: 'invalid_nonempty',
      enforced: true,
      configuredCount: rawEntries.length,
      allowedNumbers: [],
    };
  }

  return {
    environment: 'staging',
    state: 'enforced',
    enforced: true,
    configuredCount: normalizedAllowed.length,
    allowedNumbers: normalizedAllowed,
  };
}

let lastProdAllowlistAlertMs = 0;

export function evaluateWhatsappRecipientPolicy(
  e164Phone: string,
  env: Record<string, string | undefined> = process.env
): { allowed: boolean; status: WhatsappRecipientFilterStatus; reason?: string } {
  const status = getWhatsappRecipientFilterStatus(env);

  if (status.environment === 'production') {
    if (status.state === 'set_ignored_in_production') {
      logError('WHATSAPP_ALLOWED_RECIPIENTS_IGNORED_IN_PRODUCTION', {
        configuredCount: status.configuredCount,
        note: 'Production never blocks buyers via staging WHATSAPP_ALLOWED_RECIPIENTS.',
      });
      if (Date.now() - lastProdAllowlistAlertMs >= 60_000) {
        lastProdAllowlistAlertMs = Date.now();
        void sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'WARNING',
          title: 'WHATSAPP_ALLOWED_RECIPIENTS Set in Production (Ignored)',
          details: {
            configuredCount: status.configuredCount,
            note: 'Production ignored WHATSAPP_ALLOWED_RECIPIENTS so buyer traffic is not silently blocked.',
          },
        }).catch(() => {});
      }
    }
    return { allowed: true, status };
  }

  if (status.state === 'unset' || status.state === 'empty') {
    return { allowed: true, status };
  }

  if (status.state === 'invalid_nonempty') {
    logWarn('STAGING_WHATSAPP_ALLOWLIST_INVALID_ENTRIES', {
      configuredCount: status.configuredCount,
    });
    return {
      allowed: false,
      status,
      reason: 'Staging WHATSAPP_ALLOWED_RECIPIENTS contains no valid phone numbers.',
    };
  }

  const matched = status.allowedNumbers.includes(e164Phone);
  return {
    allowed: matched,
    status,
    reason: matched ? undefined : 'Recipient number is not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
  };
}

export function isPhoneAllowedByStagingList(e164Phone: string): boolean {
  return evaluateWhatsappRecipientPolicy(e164Phone).allowed;
}

export async function checkWhatsappDailyCaps(
  params: { vendorId?: string | null; e164Phone: string },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ allowed: boolean; error?: string; vendorCount: number; buyerCount: number }> {
  const { maxVendorDaily, maxBuyerDaily } = await getWhatsappDailyLimits(supabaseClient);
  const phoneHash = hashWhatsappPhone(params.e164Phone);
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = utcDayStart.toISOString();

  const supabase = supabaseClient || getServiceSupabase();
  let vendorCount = 0;
  if (params.vendorId) {
    const { count: vCount, error: vErr } = await supabase
      .from('whatsapp_message_log')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', params.vendorId)
      .neq('status', 'blocked')
      .gte('created_at', dayStartIso);

    if (vErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'WhatsApp Vendor Daily Cap Query Failed (Fail Closed)',
        details: { vendorId: params.vendorId, error: vErr.message },
      }).catch(() => {});
      throw new Error(`WhatsApp vendor daily cap query failed: ${vErr.message}`);
    }
    vendorCount = vCount || 0;
  }

  const { count: bCount, error: bErr } = await supabase
    .from('whatsapp_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_phone_hash', phoneHash)
    .neq('status', 'blocked')
    .gte('created_at', dayStartIso);

  if (bErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp Buyer Daily Cap Query Failed (Fail Closed)',
      details: { error: bErr.message },
    }).catch(() => {});
    throw new Error(`WhatsApp buyer daily cap query failed: ${bErr.message}`);
  }
  const buyerCount = bCount || 0;

  if (params.vendorId && vendorCount >= maxVendorDaily) {
    return {
      allowed: false,
      error: `Vendor daily WhatsApp message cap (${maxVendorDaily}/day) reached.`,
      vendorCount,
      buyerCount,
    };
  }

  if (buyerCount >= maxBuyerDaily) {
    return {
      allowed: false,
      error: `Daily WhatsApp limit (${maxBuyerDaily}/day) reached for this recipient number.`,
      vendorCount,
      buyerCount,
    };
  }

  return { allowed: true, vendorCount, buyerCount };
}

export async function logWhatsappOutbound(
  entry: {
    messageId: string;
    transactionId?: string | null;
    vendorId?: string | null;
    vendorHandle?: string | null;
    e164Phone: string;
    templateName: string;
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'blocked';
    errorCode?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const phoneHash = hashWhatsappPhone(entry.e164Phone);
  const maskedNumber = maskWhatsappNumber(entry.e164Phone);
  const now = new Date().toISOString();

  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase.from('whatsapp_message_log').insert({
    message_id: entry.messageId,
    transaction_id: entry.transactionId || null,
    vendor_id: entry.vendorId || null,
    vendor_handle: entry.vendorHandle || null,
    recipient_phone_hash: phoneHash,
    masked_number: maskedNumber,
    template_name: entry.templateName,
    status: entry.status,
    error_code: entry.errorCode || null,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp Audit Log Insert Failed (Fail Closed)',
      transactionId: entry.transactionId || undefined,
      details: { templateName: entry.templateName, error: error.message },
    }).catch(() => {});
    throw new Error(`WhatsApp audit log insert failed: ${error.message}`);
  }
}

export async function checkAndAlertWhatsappAnomalies(
  context: { eventType: 'failed' | 'not_me' | 'stop'; transactionId?: string | null; maskedPhone?: string },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  if (context.eventType === 'not_me' || context.eventType === 'stop') {
    await sendSystemAlert({
      type: 'SECURITY_LOCKOUT',
      severity: 'CRITICAL',
      title: `WhatsApp Opt-Out / Block Triggered (${context.eventType.toUpperCase()})`,
      transactionId: context.transactionId || undefined,
      details: {
        summary: `Recipient ${context.maskedPhone || '******'} tapped 'Not me' or sent STOP. Number added to whatsapp_do_not_contact.`,
        eventType: context.eventType,
        maskedPhone: context.maskedPhone || '******',
        transactionId: context.transactionId || null,
      },
    }).catch(() => {});
    return;
  }

  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);

  const supabase = supabaseClient || getServiceSupabase();
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select('status')
    .gte('created_at', utcDayStart.toISOString())
    .limit(100);

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp Anomaly Metrics Query Failed (Fail Closed)',
      transactionId: context.transactionId || undefined,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`WhatsApp anomaly check query failed: ${error.message}`);
  }

  const total = Array.isArray(data) ? data.length : 0;
  const failed = Array.isArray(data) ? data.filter((r) => r.status === 'failed').length : 0;

  if (failed >= 3 && total > 0 && failed / total >= 0.3) {
    await sendSystemAlert({
      type: 'WEBHOOK_FAILURE',
      severity: 'CRITICAL',
      title: 'High WhatsApp Delivery Failure Rate Detected',
      transactionId: context.transactionId || undefined,
      details: {
        summary: `${failed} of ${total} outbound WhatsApp messages failed today (${Math.round((failed / total) * 100)}%).`,
        failed,
        total,
      },
    }).catch(() => {});
  }
}

export interface TxWhatsappStatePatch {
  buyer_whatsapp_consent?: boolean;
  buyer_phone_verified?: boolean;
  buyer_phone_verified_at?: string | null;
  whatsapp_message_id?: string | null;
  whatsapp_delivery_status?: WhatsappDeliveryStatus;
  whatsapp_blocked?: boolean;
}

/**
 * Persists WhatsApp state for a transaction strictly to public.transactions.
 */
export async function updateTransactionWhatsappState(
  transactionId: string,
  patch: TxWhatsappStatePatch,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase
    .from('transactions')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId);

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Transaction WhatsApp State Update Failed (Fail Closed)',
      transactionId,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Failed updating transaction WhatsApp state: ${error.message}`);
  }
}

/**
 * Records a buyer WhatsApp phone verification strictly in public.buyer_phone_verifications
 * (storing only SHA-256 hash + masked number, never plaintext).
 */
export async function recordBuyerPhoneVerification(
  input: {
    transactionId: string;
    phone: string;
    verificationMethod?: 'WHATSAPP_QUICK_REPLY' | 'WHATSAPP_INBOUND';
    whatsappMessageId?: string | null;
    verifiedAt?: string;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const normalized = normalizeWhatsappPhone(input.phone) || input.phone;
  const phoneHash = hashWhatsappPhone(normalized);
  const maskedPhone = maskWhatsappNumber(normalized);
  const verifiedAt = input.verifiedAt || new Date().toISOString();
  const method = input.verificationMethod || 'WHATSAPP_QUICK_REPLY';
  const wamid = input.whatsappMessageId || null;

  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase
    .from('buyer_phone_verifications')
    .upsert(
      {
        transaction_id: input.transactionId,
        phone_hash: phoneHash,
        masked_phone: maskedPhone,
        verified: true,
        verification_method: method,
        whatsapp_message_id: wamid,
        verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'transaction_id' }
    );

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Buyer Phone Verification Persistence Failed (Fail Closed)',
      transactionId: input.transactionId,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Failed recording buyer_phone_verifications row: ${error.message}`);
  }
}

/**
 * Revokes buyer WhatsApp phone verification strictly in public.buyer_phone_verifications (STOP / "Not me").
 */
export async function revokeBuyerPhoneVerification(
  transactionId: string,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase
    .from('buyer_phone_verifications')
    .update({
      verified: false,
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', transactionId);

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Buyer Phone Verification Revocation Failed (Fail Closed)',
      transactionId,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Failed revoking buyer_phone_verifications row: ${error.message}`);
  }
}

export const WHATSAPP_DB_COLUMNS =
  'buyer_whatsapp_consent, buyer_phone_verified, buyer_phone_verified_at, whatsapp_message_id, whatsapp_delivery_status, whatsapp_blocked';

/**
 * Queries a single transaction selecting WhatsApp verification columns strictly (fail closed).
 */
export async function selectTransactionWithWhatsapp<T extends Record<string, any>>(
  supabase: ReturnType<typeof getServiceSupabase>,
  id: string,
  baseColumns: string
): Promise<{ data: T | null; error: any }> {
  const withWaCols = `${baseColumns}, ${WHATSAPP_DB_COLUMNS}`;
  const { data: txDataRaw, error: txErr } = await supabase
    .from('transactions')
    .select(withWaCols)
    .eq('id', id)
    .maybeSingle();

  if (txErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Transaction WhatsApp Select Failed (Fail Closed)',
      transactionId: id,
      details: { error: txErr.message },
    }).catch(() => {});
    return { data: null, error: txErr };
  }

  let txData = (txDataRaw as unknown as Record<string, any>) || null;
  if (!txData) {
    return { data: null, error: null };
  }

  if (!txData.buyer_phone_verified && !txData.whatsapp_blocked) {
    const { data: bpv, error: bpvErr } = await supabase
      .from('buyer_phone_verifications')
      .select('verified, verified_at')
      .eq('transaction_id', id)
      .eq('verified', true)
      .maybeSingle();

    if (bpvErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'buyer_phone_verifications Select Failed (Fail Closed)',
        transactionId: id,
        details: { error: bpvErr.message },
      }).catch(() => {});
      return { data: null, error: bpvErr };
    }

    if (bpv?.verified) {
      txData = {
        ...txData,
        buyer_phone_verified: true,
        buyer_phone_verified_at: bpv.verified_at ?? txData.buyer_phone_verified_at ?? null,
      };
    }
  }

  return {
    data: (txData as unknown as T) || null,
    error: null,
  };
}

/**
 * Queries transaction list selecting WhatsApp verification columns strictly (fail closed).
 */
export async function selectTransactionsListWithWhatsapp<T extends Record<string, any>>(
  supabase: ReturnType<typeof getServiceSupabase>,
  vendorHandle: string | null,
  baseColumns: string
): Promise<{ data: T[]; error: any }> {
  let q = supabase
    .from('transactions')
    .select(`${baseColumns}, ${WHATSAPP_DB_COLUMNS}`)
    .order('created_at', { ascending: false });
  if (vendorHandle) {
    q = q.eq('vendor_handle', vendorHandle.trim());
  }

  const { data, error } = await q;
  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Transaction List WhatsApp Select Failed (Fail Closed)',
      details: { error: error.message },
    }).catch(() => {});
    return { data: [], error };
  }

  return { data: (data as unknown as T[]) || [], error: null };
}

/**
 * Verifies that the triggering vendor is KYC-verified (and allowlisted if vendor_allowlist_mode = true)
 * before permitting any outbound WhatsApp template dispatch.
 */
export async function verifyVendorEligibleForWhatsapp(
  params: { vendorId?: string | null; vendorHandle?: string | null },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ eligible: boolean; error?: string }> {
  const supabase = supabaseClient || getServiceSupabase();
  const isUuid =
    Boolean(params.vendorId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(params.vendorId));

  let vendor: { kyc_status?: string; is_allowlisted?: boolean } | null = null;

  if (isUuid && params.vendorId) {
    const { data, error } = await supabase
      .from('vendors')
      .select('kyc_status, is_allowlisted')
      .eq('id', params.vendorId)
      .maybeSingle();
    if (error) {
      throw new Error(`Vendor WhatsApp eligibility lookup failed: ${error.message}`);
    }
    vendor = data;
  } else if (params.vendorHandle) {
    const cleanHandle = params.vendorHandle.trim().toLowerCase().replace(/^@/, '');
    const { data, error } = await supabase
      .from('vendors')
      .select('kyc_status, is_allowlisted')
      .or(`store_name.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Vendor WhatsApp eligibility lookup failed: ${error.message}`);
    }
    vendor = data;
  }

  if (!vendor) {
    return { eligible: false, error: 'Vendor account could not be verified for outbound WhatsApp.' };
  }
  if (vendor.kyc_status !== 'verified') {
    return {
      eligible: false,
      error: 'Only KYC-verified vendors can trigger outbound WhatsApp messages.',
    };
  }

  const hotSettings = await getHotSettings();
  const allowlistRaw = await requireHotSetting(hotSettings, 'vendor_allowlist_mode');
  const allowlistMode = Boolean(allowlistRaw === true || allowlistRaw === 'true');
  if (allowlistMode && vendor.is_allowlisted !== true) {
    return {
      eligible: false,
      error: 'Only allowlisted vendors can trigger outbound WhatsApp messages while allowlist mode is active.',
    };
  }
  return { eligible: true };
}

/**
 * Redacts virtual account details whenever an order is blocked or its buyer WhatsApp number is not yet verified.
 */
export function applyWhatsappVerificationRedaction<T extends Record<string, any>>(tx: T): T {
  const buyerPhoneVerified = Boolean(tx.buyer_phone_verified);
  const whatsappBlocked = Boolean(tx.whatsapp_blocked);
  const whatsappDeliveryStatus: WhatsappDeliveryStatus =
    tx.whatsapp_delivery_status && tx.whatsapp_delivery_status !== 'not_sent'
      ? tx.whatsapp_delivery_status
      : 'not_sent';
  const buyerWhatsappConsent = Boolean(tx.buyer_whatsapp_consent);
  const buyerPhoneVerifiedAt = tx.buyer_phone_verified_at || null;
  const whatsappMessageId = tx.whatsapp_message_id || null;

  const isVerifiedAndUnblocked = buyerPhoneVerified && !whatsappBlocked;

  return {
    ...tx,
    buyer_whatsapp_consent: buyerWhatsappConsent,
    buyer_phone_verified: buyerPhoneVerified,
    buyer_phone_verified_at: buyerPhoneVerifiedAt,
    whatsapp_delivery_status: whatsappDeliveryStatus,
    whatsapp_blocked: whatsappBlocked,
    whatsapp_message_id: whatsappMessageId,
    virtual_account_number: isVerifiedAndUnblocked ? tx.virtual_account_number : null,
    virtual_bank_name: isVerifiedAndUnblocked ? tx.virtual_bank_name : null,
    virtual_account_name: isVerifiedAndUnblocked ? tx.virtual_account_name : null,
    virtual_nuban_id: isVerifiedAndUnblocked ? tx.virtual_nuban_id : null,
  };
}

/**
 * Low-level Meta WhatsApp Cloud API dispatcher.
 */
function rememberDispatchedPayload(
  messageId: string | undefined,
  payload: MetaTemplatePayload,
  meta: {
    transactionId?: string;
    templateName: string;
    isRetry?: boolean;
  }
) {
  if (!messageId || meta.isRetry) return;
  const store = getWhatsappStore();
  if (!store.recentPayloadsByWamid) {
    store.recentPayloadsByWamid = new Map();
  }
  store.recentPayloadsByWamid.set(messageId, {
    payload,
    transactionId: meta.transactionId,
    templateName: meta.templateName,
    storedAt: Date.now(),
  });
  if (store.recentPayloadsByWamid.size > 500) {
    const oldestKey = store.recentPayloadsByWamid.keys().next().value;
    if (oldestKey) store.recentPayloadsByWamid.delete(oldestKey);
  }
}

export function extractTemplateBodyVariableCount(bodyText: string): number {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  if (matches.length === 0) return 0;
  const indices = [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b);
  return indices[indices.length - 1] || 0;
}

/**
 * Validates that a constructed Meta Cloud API payload strictly matches the defined
 * body variable count and button parameters in WHATSAPP_TEMPLATES.
 */
export function validateWhatsappTemplatePayload(payload: MetaTemplatePayload): void {
  const tplName = payload?.template?.name as keyof typeof WHATSAPP_TEMPLATES | undefined;
  const def = tplName ? WHATSAPP_TEMPLATES[tplName] : undefined;
  if (!def) {
    throw new Error(`Unknown WhatsApp template: "${String(tplName || '')}".`);
  }

  const expectedBodyVars = extractTemplateBodyVariableCount(def.bodyText);
  const bodyComp = (payload.template.components || []).find((c) => c.type === 'body') as
    | { parameters?: unknown[] }
    | undefined;
  const actualBodyVars = Array.isArray(bodyComp?.parameters) ? bodyComp.parameters.length : 0;

  if (actualBodyVars !== expectedBodyVars) {
    throw new Error(
      `WhatsApp template "${def.name}" expects ${expectedBodyVars} body parameter(s), got ${actualBodyVars}.`
    );
  }

  const defButtons = def.buttons || [];
  const btnComps = (payload.template.components || []).filter((c) => c.type === 'button') as Array<{
    index?: string;
    sub_type?: string;
    parameters?: Array<{ type?: string; payload?: string; text?: string }>;
  }>;

  for (let i = 0; i < defButtons.length; i++) {
    const btnDef = defButtons[i];
    const comp = btnComps.find((c) => String(c.index) === String(i));
    if (btnDef.type === 'QUICK_REPLY') {
      if (!comp || comp.sub_type !== 'quick_reply' || !comp.parameters?.[0]?.payload) {
        throw new Error(
          `WhatsApp template "${def.name}" quick reply button ${i} ("${btnDef.text}") requires an explicit server payload.`
        );
      }
    } else if (btnDef.type === 'URL' && /\{\{\d+\}\}/.test(btnDef.urlExample || '')) {
      if (!comp || comp.sub_type !== 'url' || !comp.parameters?.[0]?.text) {
        throw new Error(
          `WhatsApp template "${def.name}" dynamic URL button ${i} ("${btnDef.text}") requires a URL parameter.`
        );
      }
    } else if (btnDef.type === 'OTP') {
      if (!comp || comp.sub_type !== 'url' || !comp.parameters?.[0]?.text) {
        throw new Error(
          `WhatsApp template "${def.name}" OTP copy-code button ${i} requires a 1-time code parameter.`
        );
      }
    }
  }
}

async function dispatchMetaWhatsappTemplate(
  payload: MetaTemplatePayload,
  meta: {
    transactionId?: string;
    templateName: string;
    isRetry?: boolean;
  }
): Promise<WhatsappTransportResult> {
  validateWhatsappTemplatePayload(payload);
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();

  if (!accessToken || !phoneNumberId) {
    if (!isLiveMode()) {
      const simId = `wamid.sim_${crypto.randomBytes(8).toString('hex')}`;
      console.log(
        `[WHATSAPP SANDBOX] Template=${meta.templateName} To=${maskWhatsappNumber(payload.to)} Tx=${meta.transactionId || 'n/a'} MessageId=${simId}`
      );
      rememberDispatchedPayload(simId, payload, meta);
      return { ok: true, messageId: simId, status: 'sent' };
    }
    return {
      ok: false,
      error: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured.',
      status: 'failed',
    };
  }

  try {
    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = data?.error?.message || `Meta Cloud API HTTP ${response.status}`;
      return { ok: false, error: errMsg, status: 'failed' };
    }

    const messageId = data?.messages?.[0]?.id || `wamid_${crypto.randomBytes(8).toString('hex')}`;
    const msgStatus = data?.messages?.[0]?.message_status === 'accepted' ? 'queued' : 'sent';
    rememberDispatchedPayload(messageId, payload, meta);
    return { ok: true, messageId, status: msgStatus };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'WhatsApp network error', status: 'failed' };
  }
}

/**
 * Dispatches `payment_link_v1` (UTILITY) with Quick Replies ("Continue", "Not my order")
 * carrying explicit payload IDs (`CONFIRM_ORDER:<txId>`, `NOT_ME_ORDER:<txId>`)
 * and dynamic URL button suffix `<transactionId>`.
 */
export async function sendPaymentLinkWhatsappTemplate(
  params: {
    transactionId: string;
    vendorId?: string | null;
    vendorDisplayName: string;
    itemName: string;
    totalAmount: number;
    buyerPhone: string;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{
  success: boolean;
  status: WhatsappDeliveryStatus;
  messageId?: string;
  error?: string;
}> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'Invalid buyer WhatsApp number.' };
  }

  // 0. Abuse Control: Only verified, allowlisted vendors can trigger outbound WhatsApp
  const vendorEligibility = await verifyVendorEligibleForWhatsapp(
    { vendorId: params.vendorId, vendorHandle: params.vendorDisplayName },
    supabaseClient
  );
  if (!vendorEligibility.eligible) {
    const msgId = `blocked_vendor_${crypto.randomBytes(6).toString('hex')}`;
    await logWhatsappOutbound(
      {
        messageId: msgId,
        transactionId: params.transactionId,
        vendorId: params.vendorId,
        vendorHandle: params.vendorDisplayName,
        e164Phone: e164,
        templateName: 'payment_link_v1',
        status: 'blocked',
        errorCode: 'VENDOR_NOT_VERIFIED_OR_ALLOWLISTED',
      },
      supabaseClient
    );
    return {
      success: false,
      status: 'failed',
      error: vendorEligibility.error,
    };
  }

  // 1. Check Staging recipient allowlist if configured
  if (!isPhoneAllowedByStagingList(e164)) {
    const msgId = `blocked_staging_${crypto.randomBytes(6).toString('hex')}`;
    await logWhatsappOutbound(
      {
        messageId: msgId,
        transactionId: params.transactionId,
        vendorId: params.vendorId,
        vendorHandle: params.vendorDisplayName,
        e164Phone: e164,
        templateName: 'payment_link_v1',
        status: 'blocked',
        errorCode: 'STAGING_ALLOWLIST_BLOCK',
      },
      supabaseClient
    );
    await updateTransactionWhatsappState(
      params.transactionId,
      { whatsapp_delivery_status: 'failed' },
      supabaseClient
    );
    return {
      success: false,
      status: 'failed',
      error: 'Recipient number is not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  // 2. Check Do-Not-Contact list
  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    const msgId = `blocked_dnc_${crypto.randomBytes(6).toString('hex')}`;
    await logWhatsappOutbound(
      {
        messageId: msgId,
        transactionId: params.transactionId,
        vendorId: params.vendorId,
        vendorHandle: params.vendorDisplayName,
        e164Phone: e164,
        templateName: 'payment_link_v1',
        status: 'blocked',
        errorCode: `DNC_${dnc.reason || 'OPT_OUT'}`,
      },
      supabaseClient
    );
    await updateTransactionWhatsappState(
      params.transactionId,
      { whatsapp_delivery_status: 'failed', whatsapp_blocked: true },
      supabaseClient
    );
    return {
      success: false,
      status: 'failed',
      error: 'Buyer opted out of WhatsApp messages (do-not-contact).',
    };
  }

  // 3. Enforce per-vendor and per-number daily abuse caps
  const capCheck = await checkWhatsappDailyCaps(
    { vendorId: params.vendorId, e164Phone: e164 },
    supabaseClient
  );
  if (!capCheck.allowed) {
    const msgId = `blocked_cap_${crypto.randomBytes(6).toString('hex')}`;
    await logWhatsappOutbound(
      {
        messageId: msgId,
        transactionId: params.transactionId,
        vendorId: params.vendorId,
        vendorHandle: params.vendorDisplayName,
        e164Phone: e164,
        templateName: 'payment_link_v1',
        status: 'blocked',
        errorCode: 'DAILY_CAP_EXCEEDED',
      },
      supabaseClient
    );
    await updateTransactionWhatsappState(
      params.transactionId,
      { whatsapp_delivery_status: 'failed' },
      supabaseClient
    );
    return { success: false, status: 'failed', error: capCheck.error };
  }

  const formattedAmount = formatNumberForTemplate(params.totalAmount);
  const metaPayload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164,
    type: 'template',
    template: {
      name: 'payment_link_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.vendorDisplayName },
            { type: 'text', text: params.itemName },
            { type: 'text', text: formattedAmount },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `CONFIRM_ORDER:${params.transactionId}` }],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [{ type: 'payload', payload: `NOT_ME_ORDER:${params.transactionId}` }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '2',
          parameters: [{ type: 'text', text: params.transactionId }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(metaPayload, {
    transactionId: params.transactionId,
    templateName: 'payment_link_v1',
  });

  const deliveryStatus: WhatsappDeliveryStatus = result.ok
    ? result.status || 'sent'
    : 'failed';
  const finalMsgId = result.messageId || `failed_${crypto.randomBytes(6).toString('hex')}`;

  await logWhatsappOutbound(
    {
      messageId: finalMsgId,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'payment_link_v1',
      status: deliveryStatus,
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  await updateTransactionWhatsappState(
    params.transactionId,
    {
      buyer_whatsapp_consent: true,
      whatsapp_message_id: result.ok ? finalMsgId : null,
      whatsapp_delivery_status: deliveryStatus,
    },
    supabaseClient
  );

  if (!result.ok) {
    await checkAndAlertWhatsappAnomalies(
      { eventType: 'failed', transactionId: params.transactionId, maskedPhone: maskWhatsappNumber(e164) },
      supabaseClient
    );
  }

  return {
    success: result.ok,
    status: deliveryStatus,
    messageId: result.ok ? finalMsgId : undefined,
    error: result.error,
  };
}

/**
 * Sends a 6-digit release code once via `release_code_v1` (NEVER logs plaintext code or phone).
 */
export async function sendReleaseCodeWhatsappTemplate(
  params: {
    transactionId: string;
    vendorId?: string | null;
    vendorDisplayName: string;
    itemName: string;
    releaseCode: string;
    buyerPhone: string;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; maskedPhone: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  const maskedPhone = maskWhatsappNumber(e164 || params.buyerPhone);
  if (!e164) {
    return { success: false, maskedPhone, error: 'Missing or invalid buyer WhatsApp number.' };
  }

  if (!isPhoneAllowedByStagingList(e164)) {
    await logWhatsappOutbound(
      {
        messageId: `blocked_staging_${crypto.randomBytes(6).toString('hex')}`,
        transactionId: params.transactionId,
        vendorId: params.vendorId,
        vendorHandle: params.vendorDisplayName,
        e164Phone: e164,
        templateName: 'release_code_v1',
        status: 'blocked',
        errorCode: 'STAGING_ALLOWLIST_BLOCK',
      },
      supabaseClient
    );
    return {
      success: false,
      maskedPhone,
      error: 'Buyer phone not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, maskedPhone, error: 'Recipient opted out on WhatsApp.' };
  }

  const metaPayload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164,
    type: 'template',
    template: {
      name: WHATSAPP_TEMPLATES.release_code_v1.name,
      language: { code: WHATSAPP_TEMPLATES.release_code_v1.language },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.releaseCode },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: params.releaseCode },
          ],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(metaPayload, {
    transactionId: params.transactionId,
    templateName: 'release_code_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `rc_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'release_code_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  if (!result.ok) {
    await checkAndAlertWhatsappAnomalies(
      { eventType: 'failed', transactionId: params.transactionId, maskedPhone },
      supabaseClient
    );
  }

  return { success: result.ok, maskedPhone, error: result.error };
}

/**
 * Sends a 6-digit OTP for dispute freeze or code reissue via `verification_otp_v1`.
 */
export async function sendOtpWhatsappTemplate(
  params: {
    transactionId: string;
    buyerPhone: string;
    otp: string;
    purpose: 'dispute' | 'reissue' | 'refund_account' | 'buyer_session';
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; maskedPhone: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  const maskedPhone = maskWhatsappNumber(e164 || params.buyerPhone);
  if (!e164) {
    return { success: false, maskedPhone, error: 'Missing or invalid buyer WhatsApp number.' };
  }

  if (!isPhoneAllowedByStagingList(e164)) {
    await logWhatsappOutbound(
      {
        messageId: `blocked_staging_${crypto.randomBytes(6).toString('hex')}`,
        transactionId: params.transactionId,
        e164Phone: e164,
        templateName: 'verification_otp_v1',
        status: 'blocked',
        errorCode: 'STAGING_ALLOWLIST_BLOCK',
      },
      supabaseClient
    );
    return {
      success: false,
      maskedPhone,
      error: 'Buyer phone not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, maskedPhone, error: 'Recipient opted out on WhatsApp.' };
  }

  const metaPayload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164,
    type: 'template',
    template: {
      name: 'verification_otp_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.otp },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: params.otp },
          ],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(metaPayload, {
    transactionId: params.transactionId,
    templateName: 'verification_otp_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `otp_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      e164Phone: e164,
      templateName: 'verification_otp_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return { success: result.ok, maskedPhone, error: result.error };
}

/**
 * Strictly verifies Meta WhatsApp Cloud API X-Hub-Signature-256 HMAC-SHA256 header.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret || !signatureHeader) {
    return false;
  }

  const normalized = signatureHeader.trim();
  const expectedPrefix = 'sha256=';
  if (!normalized.startsWith(expectedPrefix)) {
    return false;
  }

  const receivedHex = normalized.slice(expectedPrefix.length);
  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const receivedBuf = Buffer.from(receivedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (receivedBuf.length === 0 || receivedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Atomic replay protection for Meta WhatsApp webhook events.
 * Returns true if this eventKey is new and claimed; false if already processed.
 */
export async function claimWhatsappWebhookEvent(
  eventKey: string,
  eventType: string,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<boolean> {
  const supabase = supabaseClient || getServiceSupabase();
  const { error } = await supabase.from('whatsapp_webhook_events').insert({
    event_key: eventKey,
    event_type: eventType,
    created_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === '23505') {
      return false;
    }
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp Webhook Replay Claim Failed (Fail Closed)',
      details: { eventKey, eventType, error: error.message },
    }).catch(() => {});
    throw new Error(`WhatsApp webhook replay check failed: ${error.message}`);
  }

  return true;
}

/**
 * Dispatches WhatsApp verification confirmation request for a vendor's business number.
 */
export async function sendVendorPhoneVerifyWhatsapp(
  params: {
    vendorId: string;
    vendorDisplayName: string;
    vendorPhone: string;
    maskedAccountHint?: string;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.vendorPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'Invalid vendor WhatsApp phone number.' };
  }

  if (!isPhoneAllowedByStagingList(e164)) {
    return {
      success: false,
      status: 'failed',
      error: 'Vendor phone is not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'vendor_phone_verify_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.vendorDisplayName },
            { type: 'text', text: params.maskedAccountHint || 'Vendor Onboarding' },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `CONFIRM_VENDOR_PHONE:${params.vendorId}` }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    templateName: 'vendor_phone_verify_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `vphone_${crypto.randomBytes(6).toString('hex')}`,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'vendor_phone_verify_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Dispatches WhatsApp confirmation required before changing a vendor's settlement bank account.
 */
export async function sendSettlementChangeConfirmWhatsapp(
  params: {
    vendorId: string;
    vendorDisplayName: string;
    vendorPhone: string;
    newAccountLast4: string;
    newBankCode: string;
    newBankName?: string;
    waitHours: number;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.vendorPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'Invalid vendor WhatsApp phone number.' };
  }

  if (!isPhoneAllowedByStagingList(e164)) {
    return {
      success: false,
      status: 'failed',
      error: 'Vendor phone is not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const cleanDigits = String(params.newAccountLast4 || '').replace(/[^0-9]/g, '');
  const accountLast4 =
    cleanDigits.slice(-4) ||
    String(params.newAccountLast4 || '').replace(/\*/g, '').trim().slice(-4);
  const resolvedBankName = resolveNigerianBankName(params.newBankName || params.newBankCode);

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'settlement_change_confirm_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.vendorDisplayName },
            { type: 'text', text: accountLast4 },
            { type: 'text', text: resolvedBankName },
            { type: 'text', text: String(params.waitHours) },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `CONFIRM_SETTLEMENT_CHANGE:${params.vendorId}` }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    templateName: 'settlement_change_confirm_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `bankchg_${crypto.randomBytes(6).toString('hex')}`,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'settlement_change_confirm_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Notifies the buyer when their release code was entered on an order subject to a cooling window,
 * giving them a one-tap "PROBLEM" button (or "PROBLEM" reply) to immediately freeze payout.
 */
export async function sendCoolingWindowWhatsappNotice(
  params: {
    transactionId: string;
    buyerPhone: string;
    itemName: string;
    totalAmount: number;
    coolingHours: number;
    payoutAvailableAt: string;
    vendorId?: string | null;
    vendorHandle?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'No buyer phone available for cooling notice.' };
  }

  if (!isPhoneAllowedByStagingList(e164)) {
    return {
      success: false,
      status: 'failed',
      error: 'Buyer phone is not in staging WHATSAPP_ALLOWED_RECIPIENTS.',
    };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'payout_cooling_notice_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.itemName },
            { type: 'text', text: formatNairaForTemplate(params.totalAmount) },
            { type: 'text', text: String(params.coolingHours) },
            { type: 'text', text: params.payoutAvailableAt },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `PROBLEM_ORDER:${params.transactionId}` }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    transactionId: params.transactionId,
    templateName: 'payout_cooling_notice_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `cool_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorHandle,
      e164Phone: e164,
      templateName: 'payout_cooling_notice_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Tier 1 Item 1: Exact Cloud API template payload setting `message_send_ttl_seconds: -1` (30 days)
 * on the `release_code_v1` AUTHENTICATION template so codes are not dropped when offline.
 */
export function buildMetaReleaseCodeTemplatePayload() {
  return {
    name: WHATSAPP_TEMPLATES.release_code_v1.name,
    category: 'AUTHENTICATION' as const,
    language: 'en',
    message_send_ttl_seconds: -1,
    components: [
      {
        type: 'BODY',
        add_security_recommendation: false,
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'OTP',
            otp_type: 'COPY_CODE',
            text: 'Copy code',
          },
        ],
      },
    ],
  };
}

/**
 * Cloud API template payload for `verification_otp_v1` (AUTHENTICATION, default 10-minute TTL,
 * copy-code button, no security recommendation line, no expiry line).
 */
export function buildMetaVerificationOtpTemplatePayload() {
  return {
    name: WHATSAPP_TEMPLATES.verification_otp_v1.name,
    category: 'AUTHENTICATION' as const,
    language: 'en',
    components: [
      {
        type: 'BODY',
        add_security_recommendation: false,
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'OTP',
            otp_type: 'COPY_CODE',
            text: 'Copy code',
          },
        ],
      },
    ],
  };
}

function redactMetaTokensInValue(input: unknown, accessToken?: string): unknown {
  const cleanString = (raw: string): string => {
    let out = raw;
    if (accessToken && accessToken.trim().length >= 8) {
      out = out.split(accessToken.trim()).join('[REDACTED_TOKEN]');
    }
    out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    out = out.replace(/EAA[A-Za-z0-9]{10,}/g, '[REDACTED_META_TOKEN]');
    return out;
  };

  if (typeof input === 'string') return cleanString(input);
  if (Array.isArray(input)) return input.map((v) => redactMetaTokensInValue(v, accessToken));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/token|secret|authorization|password/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactMetaTokensInValue(v, accessToken);
      }
    }
    return out;
  }
  return input;
}

export interface MetaTemplateUpsertResult {
  ok: boolean;
  templateName: 'release_code_v1' | 'verification_otp_v1';
  httpStatus?: number;
  status?: number;
  templateId?: string;
  payload:
    | ReturnType<typeof buildMetaReleaseCodeTemplatePayload>
    | ReturnType<typeof buildMetaVerificationOtpTemplatePayload>;
  responseBody?: unknown;
  metaErrorCode?: number | string | null;
  metaErrorSubcode?: number | string | null;
  error?: string;
}

export async function upsertMetaAuthTemplate(
  templateName: 'release_code_v1' | 'verification_otp_v1',
  params?: {
    wabaId?: string;
    accessToken?: string;
    apiVersion?: string;
  }
): Promise<MetaTemplateUpsertResult> {
  const wabaId = (params?.wabaId || process.env.WHATSAPP_WABA_ID || '').trim();
  const accessToken = (params?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const apiVersion = (params?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const payload =
    templateName === 'release_code_v1'
      ? buildMetaReleaseCodeTemplatePayload()
      : buildMetaVerificationOtpTemplatePayload();

  if (!wabaId || !accessToken) {
    return {
      ok: false,
      templateName,
      payload,
      error: 'WHATSAPP_WABA_ID and WHATSAPP_ACCESS_TOKEN are required to publish template updates to Meta Graph API.',
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    let parsed: any = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { rawText };
    }
    const sanitizedBody = redactMetaTokensInValue(parsed, accessToken);
    if (!res.ok) {
      return {
        ok: false,
        templateName,
        httpStatus: res.status,
        status: res.status,
        payload,
        responseBody: sanitizedBody,
        metaErrorCode: parsed?.error?.code ?? null,
        metaErrorSubcode: parsed?.error?.error_subcode ?? null,
        error: String(
          redactMetaTokensInValue(
            parsed?.error?.message || `Meta template API HTTP ${res.status}`,
            accessToken
          )
        ),
      };
    }
    return {
      ok: true,
      templateName,
      httpStatus: res.status,
      status: res.status,
      templateId: parsed?.id,
      payload,
      responseBody: sanitizedBody,
      metaErrorCode: null,
      metaErrorSubcode: null,
    };
  } catch (err: any) {
    return {
      ok: false,
      templateName,
      payload,
      error: String(
        redactMetaTokensInValue(err?.message || 'Network error calling Meta template API', accessToken)
      ),
    };
  }
}

export async function upsertMetaAuthenticationTemplates(params?: {
  wabaId?: string;
  accessToken?: string;
  apiVersion?: string;
}): Promise<MetaTemplateUpsertResult[]> {
  const releaseRes = await upsertMetaAuthTemplate('release_code_v1', params);
  const otpRes = await upsertMetaAuthTemplate('verification_otp_v1', params);
  return [releaseRes, otpRes];
}

export async function upsertMetaReleaseCodeTemplateTtl(params?: {
  wabaId?: string;
  accessToken?: string;
  apiVersion?: string;
}): Promise<MetaTemplateUpsertResult> {
  return upsertMetaAuthTemplate('release_code_v1', params);
}

/**
 * Tier 1 Item 20: Sends `order_dispatched_v1` (UTILITY) when vendor submits proof of dispatch.
 */
export async function sendOrderDispatchedWhatsapp(
  params: {
    transactionId: string;
    buyerPhone: string;
    vendorDisplayName: string;
    itemName: string;
    courierLabel: string;
    trackingRef: string;
    vendorId?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'No buyer phone available.' };
  }
  if (!isPhoneAllowedByStagingList(e164)) {
    return { success: false, status: 'failed', error: 'Buyer phone not in staging WHATSAPP_ALLOWED_RECIPIENTS.' };
  }
  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'order_dispatched_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.vendorDisplayName },
            { type: 'text', text: params.itemName },
            { type: 'text', text: params.trackingRef || params.transactionId.slice(0, 8) },
            { type: 'text', text: params.courierLabel },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: params.transactionId }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    transactionId: params.transactionId,
    templateName: 'order_dispatched_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `disp_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'order_dispatched_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Tier 1 Item 20: Sends `delivery_reminder_v1` (UTILITY) ~24h before delivery window closes.
 */
export async function sendDeliveryReminderWhatsapp(
  params: {
    transactionId: string;
    buyerPhone: string;
    itemName: string;
    vendorDisplayName: string;
    hoursLeftText: string;
    vendorId?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'No buyer phone available.' };
  }
  if (!isPhoneAllowedByStagingList(e164)) {
    return { success: false, status: 'failed', error: 'Buyer phone not in staging WHATSAPP_ALLOWED_RECIPIENTS.' };
  }
  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'delivery_reminder_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.itemName },
            { type: 'text', text: params.vendorDisplayName },
            { type: 'text', text: params.hoursLeftText },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `DISPUTE_ORDER:${params.transactionId}` }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '1',
          parameters: [{ type: 'text', text: params.transactionId }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    transactionId: params.transactionId,
    templateName: 'delivery_reminder_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `rem_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorDisplayName,
      e164Phone: e164,
      templateName: 'delivery_reminder_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Tier 1 Item 20: Sends `dispute_opened_v1` (UTILITY) to counterparty when a dispute opens or receives a response.
 */
export async function sendDisputeOpenedOrUpdatedWhatsapp(
  params: {
    transactionId: string;
    recipientPhone: string;
    itemName: string;
    updateSummary: string;
    deadlineText: string;
    vendorId?: string | null;
    vendorHandle?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; status: WhatsappDeliveryStatus; messageId?: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.recipientPhone);
  if (!e164) {
    return { success: false, status: 'failed', error: 'No counterparty phone available.' };
  }
  if (!isPhoneAllowedByStagingList(e164)) {
    return { success: false, status: 'failed', error: 'Recipient phone not in staging WHATSAPP_ALLOWED_RECIPIENTS.' };
  }
  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, status: 'failed', error: `Recipient opted out (${dnc.reason}).` };
  }

  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: 'dispute_opened_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.itemName },
            { type: 'text', text: params.updateSummary },
            { type: 'text', text: params.deadlineText },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: params.transactionId }],
        },
      ],
    },
  };

  const result = await dispatchMetaWhatsappTemplate(payload, {
    transactionId: params.transactionId,
    templateName: 'dispute_opened_v1',
  });

  await logWhatsappOutbound(
    {
      messageId: result.messageId || `dispnote_${crypto.randomBytes(6).toString('hex')}`,
      transactionId: params.transactionId,
      vendorId: params.vendorId,
      vendorHandle: params.vendorHandle,
      e164Phone: e164,
      templateName: 'dispute_opened_v1',
      status: result.ok ? result.status || 'sent' : 'failed',
      errorCode: result.ok ? null : result.error || 'META_API_ERROR',
    },
    supabaseClient
  );

  return {
    success: result.ok,
    status: result.ok ? result.status || 'sent' : 'failed',
    messageId: result.messageId,
    error: result.error,
  };
}

/**
 * Tier 1 Item 1: On a failed or undelivered status webhook, retries ONCE if an outbound payload is cached,
 * increments retry_count, alerts ops, and preserves buyer-facing "Didn't receive your code? Send it again".
 */
export async function handleFailedOrUndeliveredWhatsappStatus(
  params: {
    wamid: string;
    transactionId?: string | null;
    errorCode?: string | null;
    errorTitle?: string | null;
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ retried: boolean; retryMessageId?: string; retryError?: string }> {
  const supabase = supabaseClient || getServiceSupabase();
  const store = getWhatsappStore();
  const cached = store.recentPayloadsByWamid?.get(params.wamid);
  const txId = params.transactionId || cached?.transactionId || null;

  let alreadyRetried = Boolean(cached && (cached.retryCount || 0) >= 1);
  const { data: existingLog, error: logReadErr } = await supabase
    .from('whatsapp_message_log')
    .select('retry_count')
    .eq('message_id', params.wamid)
    .maybeSingle();

  if (logReadErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'WhatsApp Retry Count Query Failed (Fail Closed)',
      transactionId: txId || undefined,
      details: { wamid: params.wamid, error: logReadErr.message },
    }).catch(() => {});
    throw new Error(`WhatsApp retry count query failed: ${logReadErr.message}`);
  }

  if (Number(existingLog?.retry_count || 0) >= 1) {
    alreadyRetried = true;
  }

  let retried = false;
  let retryMessageId: string | undefined;
  let retryError: string | undefined;

  if (cached && !alreadyRetried) {
    cached.retryCount = 1;
    store.recentPayloadsByWamid?.set(params.wamid, cached);

    const retryRes = await dispatchMetaWhatsappTemplate(cached.payload, {
      transactionId: txId || undefined,
      templateName: cached.templateName,
      isRetry: true,
    });
    retried = true;
    retryMessageId = retryRes.messageId;
    retryError = retryRes.error;

    const { error: retryUpdErr } = await supabase
      .from('whatsapp_message_log')
      .update({ retry_count: 1 })
      .eq('message_id', params.wamid);
    if (retryUpdErr) {
      throw new Error(`Failed updating whatsapp_message_log retry_count: ${retryUpdErr.message}`);
    }

    const e164 = normalizeWhatsappPhone(cached.payload.to) || cached.payload.to;
    await logWhatsappOutbound(
      {
        messageId: retryRes.messageId || `retry_${crypto.randomBytes(6).toString('hex')}`,
        transactionId: txId,
        e164Phone: e164,
        templateName: cached.templateName,
        status: retryRes.ok ? retryRes.status || 'sent' : 'failed',
        errorCode: retryRes.ok ? null : retryRes.error || 'RETRY_FAILED',
      },
      supabase
    );
  }

  if (txId) {
    await updateTransactionWhatsappState(
      txId,
      {
        whatsapp_delivery_status: retried && retryMessageId ? 'sent' : 'failed',
      },
      supabase
    );
  }

  await sendSystemAlert({
    type: 'WEBHOOK_FAILURE',
    severity: 'CRITICAL',
    title: `WhatsApp Delivery Failed/Undelivered (${cached?.templateName || 'template'})`,
    transactionId: txId || undefined,
    details: {
      failedWamid: params.wamid,
      templateName: cached?.templateName || 'unknown',
      errorCode: params.errorCode || 'undelivered',
      errorTitle: params.errorTitle || 'Recipient unreachable or offline',
      autoRetriedOnce: retried,
      retryMessageId: retryMessageId || null,
      retryError: retryError || null,
    },
  }).catch(() => {});

  return { retried, retryMessageId, retryError };
}
