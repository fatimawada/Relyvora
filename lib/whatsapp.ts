import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import { isLiveMode } from '@/lib/paymentsMode';

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
  bodyText: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL';
    text: string;
    urlExample?: string;
  }>;
}

export const WHATSAPP_TEMPLATES: Record<
  'payment_link_v1' | 'release_code_v1' | 'verification_otp_v1',
  WhatsappTemplateDefinition
> = {
  payment_link_v1: {
    name: 'payment_link_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      "Hello, {{1}} created a Relyvora escrow payment link for *{{2}}* (Total: *{{3}}*). Funds are held in escrow until you inspect the delivery and give the rider your 6-digit release code.\n\nPlease confirm below that you requested this link to view the bank transfer details, or tap 'Not me' if you did not request this order.",
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm this is me' },
      { type: 'QUICK_REPLY', text: 'Not me' },
      {
        type: 'URL',
        text: 'View Payment Link',
        urlExample: 'https://ng.relyvora.com/pay/{{1}}',
      },
    ],
  },
  release_code_v1: {
    name: 'release_code_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      'Your payment for *{{1}}* ({{2}}) is locked in Relyvora escrow.\n\nYour 6-digit delivery release code is: *{{3}}*\n\nGive this code to the dispatch rider ONLY after you inspect and accept the item. Never share this code with the vendor before delivery.',
  },
  verification_otp_v1: {
    name: 'verification_otp_v1',
    category: 'UTILITY',
    language: 'en',
    bodyText:
      '{{1}} is your Relyvora verification code for {{2}}. This code expires in 10 minutes. Do not share it with anyone.',
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

export type WhatsappTransportFn = (
  payload: MetaTemplatePayload,
  meta: {
    transactionId?: string;
    templateName: string;
    phoneNumberId?: string;
  }
) => Promise<WhatsappTransportResult>;

export interface TxWhatsappFallbackState {
  buyer_whatsapp_consent: boolean;
  buyer_phone_verified: boolean;
  buyer_phone_verified_at: string | null;
  whatsapp_message_id: string | null;
  whatsapp_delivery_status: WhatsappDeliveryStatus;
  whatsapp_blocked: boolean;
}

interface OutboundLogMemoryEntry {
  message_id: string;
  transaction_id: string | null;
  vendor_id: string | null;
  vendor_handle: string | null;
  recipient_phone_hash: string;
  masked_number: string;
  template_name: string;
  status: string;
  error_code: string | null;
  created_at: string;
}

interface GlobalWhatsappStore {
  transportOverride: WhatsappTransportFn | null;
  txStates: Map<string, TxWhatsappFallbackState>;
  dncHashes: Map<string, { masked_phone: string; reason: WhatsappDncReason; source_transaction_id?: string | null; created_at: string }>;
  outboundLogs: OutboundLogMemoryEntry[];
  webhookEvents: Set<string>;
}

const globalForWhatsapp = globalThis as unknown as {
  __relyvoraWhatsappStore?: GlobalWhatsappStore;
};

function getWhatsappStore(): GlobalWhatsappStore {
  if (!globalForWhatsapp.__relyvoraWhatsappStore) {
    globalForWhatsapp.__relyvoraWhatsappStore = {
      transportOverride: null,
      txStates: new Map(),
      dncHashes: new Map(),
      outboundLogs: [],
      webhookEvents: new Set(),
    };
  }
  return globalForWhatsapp.__relyvoraWhatsappStore;
}

/**
 * Allows automated tests to inject a deterministic Meta Cloud API transport mock.
 */
export function setWhatsappTransportForTests(fn: WhatsappTransportFn | null) {
  getWhatsappStore().transportOverride = fn;
}

/**
 * Resets in-memory fallback caches and test mocks (tests only).
 */
export function resetWhatsappTestState() {
  const store = getWhatsappStore();
  store.transportOverride = null;
  store.txStates.clear();
  store.dncHashes.clear();
  store.outboundLogs = [];
  store.webhookEvents.clear();
}

export function isSchemaMissingError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
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

export function formatNairaForTemplate(amount: number): string {
  const numeric = Number(amount) || 0;
  return `₦${numeric.toLocaleString('en-NG', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Checks in-memory + Supabase DNC registry for a normalized E.164 phone number.
 */
export async function isPhoneOnDoNotContact(
  e164Phone: string,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ blocked: boolean; reason?: string }> {
  const phoneHash = hashWhatsappPhone(e164Phone);
  const store = getWhatsappStore();

  const memHit = store.dncHashes.get(phoneHash);
  if (memHit) {
    return { blocked: true, reason: memHit.reason };
  }

  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { data, error } = await supabase
      .from('whatsapp_do_not_contact')
      .select('reason')
      .eq('phone_hash', phoneHash)
      .maybeSingle();

    if (error && !isSchemaMissingError(error)) {
      console.warn('DNC lookup error:', error.message);
    }
    if (data?.reason) {
      store.dncHashes.set(phoneHash, {
        masked_phone: maskWhatsappNumber(e164Phone),
        reason: data.reason as WhatsappDncReason,
        created_at: new Date().toISOString(),
      });
      return { blocked: true, reason: data.reason };
    }
  } catch (err) {
    console.warn('DNC lookup exception:', (err as Error)?.message);
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

  getWhatsappStore().dncHashes.set(phoneHash, {
    masked_phone: maskedPhone,
    reason: params.reason,
    source_transaction_id: params.transactionId || null,
    created_at: now,
  });

  try {
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

    if (error && !isSchemaMissingError(error)) {
      console.warn('DNC insert error:', error.message);
    }
  } catch (err) {
    console.warn('DNC insert exception:', (err as Error)?.message);
  }
}

export async function getWhatsappDailyLimits(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ maxVendorDaily: number; maxBuyerDaily: number }> {
  const envVendor = Number(process.env.MAX_DAILY_VENDOR_WHATSAPP_MESSAGES || 50);
  const envBuyer = Number(process.env.MAX_DAILY_BUYER_WHATSAPP_MESSAGES || 5);
  let maxVendorDaily = Number.isFinite(envVendor) && envVendor > 0 ? envVendor : 50;
  let maxBuyerDaily = Number.isFinite(envBuyer) && envBuyer > 0 ? envBuyer : 5;

  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['max_daily_vendor_whatsapp_messages', 'max_daily_buyer_whatsapp_messages']);

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const parsed = Number(row.value);
        if (row.key === 'max_daily_vendor_whatsapp_messages' && Number.isFinite(parsed) && parsed > 0) {
          maxVendorDaily = parsed;
        }
        if (row.key === 'max_daily_buyer_whatsapp_messages' && Number.isFinite(parsed) && parsed > 0) {
          maxBuyerDaily = parsed;
        }
      }
    }
  } catch {
    // keep env/default limits
  }

  return { maxVendorDaily, maxBuyerDaily };
}

export function isPhoneAllowedByStagingList(e164Phone: string): boolean {
  const rawList = (process.env.WHATSAPP_ALLOWED_RECIPIENTS || '').trim();
  if (!rawList) return true;
  const allowed = rawList
    .split(',')
    .map((p) => normalizeWhatsappPhone(p))
    .filter((p): p is string => Boolean(p));
  if (allowed.length === 0) return true;
  return allowed.includes(e164Phone);
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

  const store = getWhatsappStore();
  let vendorCount = store.outboundLogs.filter(
    (entry) =>
      params.vendorId &&
      entry.vendor_id === params.vendorId &&
      entry.created_at >= dayStartIso &&
      entry.status !== 'blocked'
  ).length;
  let buyerCount = store.outboundLogs.filter(
    (entry) =>
      entry.recipient_phone_hash === phoneHash &&
      entry.created_at >= dayStartIso &&
      entry.status !== 'blocked'
  ).length;

  try {
    const supabase = supabaseClient || getServiceSupabase();
    if (params.vendorId) {
      const { count: vCount, error: vErr } = await supabase
        .from('whatsapp_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', params.vendorId)
        .neq('status', 'blocked')
        .gte('created_at', dayStartIso);

      if (!vErr && typeof vCount === 'number') {
        vendorCount = Math.max(vendorCount, vCount);
      }
    }

    const { count: bCount, error: bErr } = await supabase
      .from('whatsapp_message_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_phone_hash', phoneHash)
      .neq('status', 'blocked')
      .gte('created_at', dayStartIso);

    if (!bErr && typeof bCount === 'number') {
      buyerCount = Math.max(buyerCount, bCount);
    }
  } catch {
    // use memory count if table is unavailable
  }

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

  getWhatsappStore().outboundLogs.push({
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
  });

  try {
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

    if (error && !isSchemaMissingError(error)) {
      console.warn('WhatsApp audit log insert error:', error.message);
    }
  } catch (err) {
    console.warn('WhatsApp audit log exception:', (err as Error)?.message);
  }
}

export function getInMemoryOutboundLogsForTests(): OutboundLogMemoryEntry[] {
  return [...getWhatsappStore().outboundLogs];
}

export async function checkAndAlertWhatsappAnomalies(
  context: { eventType: 'failed' | 'not_me' | 'stop'; transactionId?: string | null; maskedPhone?: string },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const store = getWhatsappStore();
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

  // High failure rate check across recent messages
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const recent = store.outboundLogs.filter((l) => l.created_at >= utcDayStart.toISOString());
  let total = recent.length;
  let failed = recent.filter((l) => l.status === 'failed').length;

  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { data, error } = await supabase
      .from('whatsapp_message_log')
      .select('status')
      .gte('created_at', utcDayStart.toISOString())
      .limit(100);

    if (!error && Array.isArray(data) && data.length > total) {
      total = data.length;
      failed = data.filter((r) => r.status === 'failed').length;
    }
  } catch {
    // use memory metrics
  }

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

/**
 * Persists WhatsApp state for a transaction to DB (if migrated) AND in-memory state overlay.
 */
export async function updateTransactionWhatsappState(
  transactionId: string,
  patch: Partial<TxWhatsappFallbackState>,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<void> {
  const store = getWhatsappStore();
  const prev = store.txStates.get(transactionId) || {
    buyer_whatsapp_consent: false,
    buyer_phone_verified: false,
    buyer_phone_verified_at: null,
    whatsapp_message_id: null,
    whatsapp_delivery_status: 'not_sent' as WhatsappDeliveryStatus,
    whatsapp_blocked: false,
  };

  store.txStates.set(transactionId, { ...prev, ...patch });

  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { error } = await supabase
      .from('transactions')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    if (error && !isSchemaMissingError(error)) {
      console.warn('Failed updating transaction WhatsApp fields:', error.message);
    }
  } catch {
    // non-fatal when running against unmigrated sandbox DB
  }
}

export function getTransactionWhatsappFallbackState(
  transactionId: string
): TxWhatsappFallbackState | undefined {
  return getWhatsappStore().txStates.get(transactionId);
}

export const WHATSAPP_DB_COLUMNS =
  'buyer_whatsapp_consent, buyer_phone_verified, buyer_phone_verified_at, whatsapp_message_id, whatsapp_delivery_status, whatsapp_blocked';

/**
 * Queries a single transaction selecting WhatsApp verification columns when migrated,
 * falling back cleanly if the SQL migration has not yet been applied to staging.
 */
export async function selectTransactionWithWhatsapp<T extends Record<string, any>>(
  supabase: ReturnType<typeof getServiceSupabase>,
  id: string,
  baseColumns: string
): Promise<{ data: T | null; error: any }> {
  const withWaCols = `${baseColumns}, ${WHATSAPP_DB_COLUMNS}`;
  const first = await supabase
    .from('transactions')
    .select(withWaCols)
    .eq('id', id)
    .maybeSingle();

  if (!first.error) {
    return { data: (first.data as unknown as T) || null, error: null };
  }

  if (isSchemaMissingError(first.error)) {
    const fallback = await supabase
      .from('transactions')
      .select(baseColumns)
      .eq('id', id)
      .maybeSingle();
    return {
      data: (fallback.data as unknown as T) || null,
      error: fallback.error,
    };
  }

  return { data: null, error: first.error };
}

/**
 * Queries transaction list selecting WhatsApp verification columns when migrated,
 * falling back cleanly if the SQL migration has not yet been applied to staging.
 */
export async function selectTransactionsListWithWhatsapp<T extends Record<string, any>>(
  supabase: ReturnType<typeof getServiceSupabase>,
  vendorHandle: string | null,
  baseColumns: string
): Promise<{ data: T[]; error: any }> {
  const buildQuery = (cols: string) => {
    let q = supabase
      .from('transactions')
      .select(cols)
      .order('created_at', { ascending: false });
    if (vendorHandle) {
      q = q.eq('vendor_handle', vendorHandle.trim());
    }
    return q;
  };

  const first = await buildQuery(`${baseColumns}, ${WHATSAPP_DB_COLUMNS}`);
  if (!first.error) {
    return { data: (first.data as unknown as T[]) || [], error: null };
  }

  if (isSchemaMissingError(first.error)) {
    const fallback = await buildQuery(baseColumns);
    return {
      data: (fallback.data as unknown as T[]) || [],
      error: fallback.error,
    };
  }

  return { data: [], error: first.error };
}

/**
 * Verifies that the triggering vendor is both KYC-verified and allowlisted
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
    const { data } = await supabase
      .from('vendors')
      .select('kyc_status, is_allowlisted')
      .eq('id', params.vendorId)
      .maybeSingle();
    vendor = data;
  } else if (params.vendorHandle) {
    const cleanHandle = params.vendorHandle.trim().toLowerCase().replace(/^@/, '');
    const { data } = await supabase
      .from('vendors')
      .select('kyc_status, is_allowlisted')
      .or(`store_name.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`)
      .limit(1)
      .maybeSingle();
    vendor = data;
  }

  if (!vendor) {
    return { eligible: false, error: 'Vendor account could not be verified for outbound WhatsApp.' };
  }
  if (vendor.kyc_status !== 'verified' || vendor.is_allowlisted !== true) {
    return {
      eligible: false,
      error: 'Only KYC-verified, allowlisted vendors can trigger outbound WhatsApp messages.',
    };
  }
  return { eligible: true };
}

/**
 * Redacts virtual account details whenever an order is blocked or its buyer WhatsApp number is not yet verified.
 */
export function applyWhatsappVerificationRedaction<T extends Record<string, any>>(tx: T): T {
  const fallback = tx?.id ? getTransactionWhatsappFallbackState(tx.id) : undefined;
  const buyerPhoneVerified =
    typeof tx.buyer_phone_verified === 'boolean'
      ? tx.buyer_phone_verified || Boolean(fallback?.buyer_phone_verified)
      : Boolean(fallback?.buyer_phone_verified);

  const whatsappBlocked =
    typeof tx.whatsapp_blocked === 'boolean'
      ? tx.whatsapp_blocked || Boolean(fallback?.whatsapp_blocked)
      : Boolean(fallback?.whatsapp_blocked);

  const whatsappDeliveryStatus: WhatsappDeliveryStatus =
    tx.whatsapp_delivery_status && tx.whatsapp_delivery_status !== 'not_sent'
      ? tx.whatsapp_delivery_status
      : fallback?.whatsapp_delivery_status || 'not_sent';

  const buyerWhatsappConsent =
    typeof tx.buyer_whatsapp_consent === 'boolean'
      ? tx.buyer_whatsapp_consent || Boolean(fallback?.buyer_whatsapp_consent)
      : Boolean(fallback?.buyer_whatsapp_consent);

  const buyerPhoneVerifiedAt = tx.buyer_phone_verified_at || fallback?.buyer_phone_verified_at || null;
  const whatsappMessageId = tx.whatsapp_message_id || fallback?.whatsapp_message_id || null;

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
async function dispatchMetaWhatsappTemplate(
  payload: MetaTemplatePayload,
  meta: {
    transactionId?: string;
    templateName: string;
  }
): Promise<WhatsappTransportResult> {
  const store = getWhatsappStore();
  if (store.transportOverride) {
    return store.transportOverride(payload, {
      ...meta,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'test_phone_id',
    });
  }

  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();

  if (!accessToken || !phoneNumberId) {
    if (!isLiveMode() && process.env.NODE_ENV !== 'production') {
      const simId = `wamid.sim_${crypto.randomBytes(8).toString('hex')}`;
      console.log(
        `[WHATSAPP SANDBOX] Template=${meta.templateName} To=${maskWhatsappNumber(payload.to)} Tx=${meta.transactionId || 'n/a'} MessageId=${simId}`
      );
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
    return { ok: true, messageId, status: msgStatus };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'WhatsApp network error', status: 'failed' };
  }
}

/**
 * Dispatches `payment_link_v1` (UTILITY) with Quick Replies ("Confirm this is me", "Not me")
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

  const formattedAmount = formatNairaForTemplate(params.totalAmount);
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
      name: 'release_code_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.itemName || 'Escrow Order' },
            { type: 'text', text: params.vendorDisplayName || 'Vendor' },
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
    purpose: 'dispute' | 'reissue';
  },
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; maskedPhone: string; error?: string }> {
  const e164 = normalizeWhatsappPhone(params.buyerPhone);
  const maskedPhone = maskWhatsappNumber(e164 || params.buyerPhone);
  if (!e164) {
    return { success: false, maskedPhone, error: 'Missing or invalid buyer WhatsApp number.' };
  }

  const dnc = await isPhoneOnDoNotContact(e164, supabaseClient);
  if (dnc.blocked) {
    return { success: false, maskedPhone, error: 'Recipient opted out on WhatsApp.' };
  }

  const label = params.purpose === 'dispute' ? 'freezing your escrow order' : 'reissuing your release code';
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
            { type: 'text', text: label },
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
  const store = getWhatsappStore();
  if (store.webhookEvents.has(eventKey)) {
    return false;
  }

  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { error } = await supabase.from('whatsapp_webhook_events').insert({
      event_key: eventKey,
      event_type: eventType,
      created_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') {
        store.webhookEvents.add(eventKey);
        return false;
      }
      if (!isSchemaMissingError(error)) {
        console.warn('Webhook replay check error:', error.message);
      }
    }
  } catch {
    // fallback to memory replay cache if table missing
  }

  store.webhookEvents.add(eventKey);
  return true;
}
