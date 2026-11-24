import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from './supabaseServer';
import { hashPhoneSignal } from './riskEngine';
import { sendSystemAlert } from './alerts';

export const NIGERIAN_PHONE_REGEX = /^(?:\+234|0)[789][01]\d{8}$/;

export function normalizeNigerianWhatsappPhone(rawPhone: string): string {
  const cleaned = String(rawPhone || '').replace(/\s+/g, '').trim();
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '+234' + cleaned.slice(1);
  }
  return cleaned;
}

export function isValidNigerianPhone(rawPhone: string): boolean {
  const cleaned = String(rawPhone || '').replace(/\s+/g, '').trim();
  return NIGERIAN_PHONE_REGEX.test(cleaned);
}

export interface SaveVendorStep1Input {
  userId: string;
  email: string;
  storeName: string;
  phoneNumber: string;
  source?: string;
  supabaseClient?: SupabaseClient;
}

export interface SaveVendorStep1Result {
  success: boolean;
  statusCode: number;
  error?: string;
  vendorId?: string;
  waitlistId?: string;
  storeName?: string;
  email?: string;
  phoneNumber?: string;
  kycStatus?: string;
}

/**
 * Persists a signed-up vendor's Step 1 account profile and records them on `public.vendor_waitlist`
 * strictly via service_role. Never sends WhatsApp or email notifications until templates are approved.
 */
export async function saveVendorStep1AndWaitlistServer(
  input: SaveVendorStep1Input
): Promise<SaveVendorStep1Result> {
  const supabase = input.supabaseClient || getServiceSupabase();
  const normalizedEmail = String(input.email || '').trim().toLowerCase();
  const cleanStoreName = String(input.storeName || '').trim();
  const rawPhone = String(input.phoneNumber || '').trim();

  if (!normalizedEmail || !cleanStoreName || cleanStoreName.length < 2 || cleanStoreName.length > 60) {
    return {
      success: false,
      statusCode: 400,
      error: 'Store name (2-60 characters) and valid email address are required.',
    };
  }

  if (!isValidNigerianPhone(rawPhone)) {
    return {
      success: false,
      statusCode: 400,
      error: 'Enter a valid Nigerian WhatsApp number (e.g. +2348000000000 or 08000000000).',
    };
  }

  const cleanPhone = normalizeNigerianWhatsappPhone(rawPhone);
  const phoneHash = hashPhoneSignal(cleanPhone);
  const nowIso = new Date().toISOString();

  const { data: existingVendor, error: vendorLookupErr } = await supabase
    .from('vendors')
    .select('id, user_id, email, kyc_status, is_suspended, is_allowlisted')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (vendorLookupErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Vendor Waitlist Lookup Failed (Fail Closed)',
      details: { error: vendorLookupErr.message },
    }).catch(() => {});
    return {
      success: false,
      statusCode: 500,
      error: `Vendor lookup failed: ${vendorLookupErr.message}`,
    };
  }

  if (existingVendor?.is_suspended === true) {
    return {
      success: false,
      statusCode: 403,
      error: 'This vendor account is currently suspended.',
    };
  }

  if (existingVendor?.user_id && existingVendor.user_id !== input.userId) {
    return {
      success: false,
      statusCode: 403,
      error: 'This email is already linked to another vendor account.',
    };
  }

  let vendorId = existingVendor?.id as string | undefined;
  let kycStatus = (existingVendor?.kyc_status as string | undefined) || 'pending';

  if (existingVendor?.id) {
    const { data: updatedVendor, error: updErr } = await supabase
      .from('vendors')
      .update({
        user_id: input.userId,
        store_name: cleanStoreName,
        phone_number: cleanPhone,
        phone_hash: phoneHash,
        updated_at: nowIso,
      })
      .eq('id', existingVendor.id)
      .select('id, kyc_status')
      .single();

    if (updErr || !updatedVendor) {
      return {
        success: false,
        statusCode: 500,
        error: `Failed updating vendor profile: ${updErr?.message || 'database error'}`,
      };
    }
    vendorId = updatedVendor.id;
    kycStatus = updatedVendor.kyc_status || kycStatus;
  } else {
    const { data: insertedVendor, error: insErr } = await supabase
      .from('vendors')
      .upsert(
        {
          user_id: input.userId,
          store_name: cleanStoreName,
          email: normalizedEmail,
          phone_number: cleanPhone,
          phone_hash: phoneHash,
          kyc_status: 'pending',
          is_allowlisted: false,
          tier: 'NEW',
          updated_at: nowIso,
        },
        { onConflict: 'email' }
      )
      .select('id, kyc_status')
      .single();

    if (insErr || !insertedVendor) {
      return {
        success: false,
        statusCode: 500,
        error: `Failed saving vendor profile: ${insErr?.message || 'database error'}`,
      };
    }
    vendorId = insertedVendor.id;
    kycStatus = insertedVendor.kyc_status || 'pending';
  }

  // Optional live pre-launch waitlist sync (tolerate pre-migration / absent table in sandbox mode)
  let waitlistId: string | undefined;
  const { data: waitlistRow, error: waitlistErr } = await supabase
    .from('vendor_waitlist')
    .upsert(
      {
        user_id: input.userId,
        vendor_id: vendorId,
        store_name: cleanStoreName,
        email: normalizedEmail,
        whatsapp_number: cleanPhone,
        whatsapp_phone_hash: phoneHash,
        status: kycStatus === 'verified' ? 'active' : 'waitlisted',
        source: input.source || 'open_signup',
        updated_at: nowIso,
      },
      { onConflict: 'email' }
    )
    .select('id')
    .single();

  if (waitlistErr || !waitlistRow) {
    const errMsg = String(waitlistErr?.message || '');
    const isTableMissing =
      waitlistErr?.code === 'PGRST205' ||
      waitlistErr?.code === '42P01' ||
      /vendor_waitlist|could not find the table|does not exist/i.test(errMsg);
    if (!isTableMissing && process.env.PAYMENTS_MODE === 'live') {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Waitlist Insert Failed (Fail Closed)',
        details: { error: errMsg || 'Empty waitlist upsert result' },
      }).catch(() => {});
      return {
        success: false,
        statusCode: 500,
        error: `Failed recording waitlist entry: ${errMsg || 'database error'}`,
      };
    }
  } else {
    waitlistId = waitlistRow.id;
  }

  return {
    success: true,
    statusCode: 200,
    vendorId,
    waitlistId,
    storeName: cleanStoreName,
    email: normalizedEmail,
    phoneNumber: cleanPhone,
    kycStatus,
  };
}
