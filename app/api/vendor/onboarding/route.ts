import { NextRequest, NextResponse } from 'next/server';
import {
  createAnchorCustomer,
  verifyAnchorCustomer,
  createAnchorDepositAccount,
  createAnchorCounterParty,
  isAnchorLiveCredentialsConfigured,
} from '@/lib/anchor';
import { isLiveMode } from '@/lib/paymentsMode';
import { isKycEnabledServer, isReleaseCodeTemplateApprovedServer } from '@/lib/launchGates';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { getVendorAllowlistModeServer } from '@/lib/safetyLimits';
import { verifyPublicSignupCaptcha } from '@/lib/captcha';
import {
  performAnchorNameEnquiry,
  verifySettlementNameMatchesKyc,
} from '@/lib/payoutSafety';
import { extractRequestDeviceFingerprints, hashPhoneSignal } from '@/lib/riskEngine';
import { sendVendorPhoneVerifyWhatsapp } from '@/lib/whatsapp';
import { sendSystemAlert } from '@/lib/alerts';

const CONSENT_TERMS_VERSION = '2026-11-tier1';

async function checkInviteOnlyAllowlist(
  supabase: ReturnType<typeof getServiceSupabase>,
  normalizedEmail: string,
  cleanStoreName: string,
  authUserId: string
): Promise<{
  allowed: boolean;
  allowlistMode: boolean;
  suspended?: boolean;
  existingVendor: Record<string, any> | null;
  error?: string;
}> {
  const allowlistMode = await getVendorAllowlistModeServer();

  const { data: existingVendor, error: vendorLookupErr } = await supabase
    .from('vendors')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (vendorLookupErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Vendor Onboarding Lookup Failed (Fail Closed)',
      details: { error: vendorLookupErr.message },
    }).catch(() => {});
    throw new Error(`Vendor lookup failed: ${vendorLookupErr.message}`);
  }

  if (existingVendor?.is_suspended === true) {
    return {
      allowed: false,
      allowlistMode,
      suspended: true,
      existingVendor,
      error: 'Suspended vendor accounts cannot re-onboard or reactivate.',
    };
  }

  if (existingVendor?.user_id && existingVendor.user_id !== authUserId) {
    return {
      allowed: false,
      allowlistMode,
      existingVendor,
      error: 'Vendor email is already linked to a different user account.',
    };
  }

  if (!allowlistMode) {
    return { allowed: true, allowlistMode: false, existingVendor };
  }

  const normalizedHandle = cleanStoreName.trim().toLowerCase().replace(/^@/, '');
  const envAllowlist = (process.env.VENDOR_ALLOWLIST || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

  const inEnvAllowlist =
    envAllowlist.includes(normalizedEmail) ||
    (normalizedHandle.length > 0 && envAllowlist.includes(normalizedHandle));

  if (existingVendor?.is_allowlisted !== true && !inEnvAllowlist) {
    return {
      allowed: false,
      allowlistMode: true,
      existingVendor,
      error:
        'Vendor onboarding is currently restricted to allowlisted accounts.',
    };
  }

  return { allowed: true, allowlistMode: true, existingVendor };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();

    // 1. Sliding-window IP rate limit (5 attempts per 15 min, shared DB bucket)
    const ip = getClientIp(request);
    const rl = await checkSharedRateLimit(`${ip}:vendor_onboarding`, 5, 15 * 60 * 1000, supabase);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many onboarding attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // 2. Require authenticated, email-confirmed vendor session
    const session = await verifyVendorOnboardingSession(request);
    if (!session.authorized || !session.user) {
      return NextResponse.json(
        { success: false, code: session.code || 'UNAUTHORIZED', error: session.error },
        { status: session.statusCode }
      );
    }

    // 2b. Option B gate: KYC & Anchor verification stays locked until KYC_ENABLED is true
    const kycEnabled = await isKycEnabledServer();
    if (!kycEnabled) {
      return NextResponse.json(
        {
          success: false,
          code: 'KYC_DISABLED',
          error: 'Verification opens when payments go live.',
        },
        { status: 403 }
      );
    }

    // Fail closed if KYC is enabled in live mode without live Anchor credentials
    if (isLiveMode()) {
      const liveAnchorCheck = isAnchorLiveCredentialsConfigured();
      if (!liveAnchorCheck.ok) {
        return NextResponse.json(
          {
            success: false,
            code: 'ANCHOR_CREDENTIALS_MISSING',
            error: liveAnchorCheck.error || 'Anchor production credentials are not configured.',
          },
          { status: 503 }
        );
      }
    }

    // 3. Validate input payload cleanly
    const body = await request.json();
    const { profile, regulatoryKyc } = body || {};

    if (body?.acceptedTermsAndProhibitedItems !== true) {
      return NextResponse.json(
        {
          success: false,
          code: 'TERMS_ACCEPTANCE_REQUIRED',
          error:
            'You must explicitly accept the Relyvora Terms of Service, Privacy Policy, and Prohibited Items Policy before onboarding.',
        },
        { status: 400 }
      );
    }

    if (!profile || !regulatoryKyc) {
      return NextResponse.json(
        { success: false, error: 'Missing profile or regulatory KYC payload.' },
        { status: 400 }
      );
    }

    const { storeName, email, phoneNumber } = profile;
    const {
      legalFirstName,
      legalLastName,
      dateOfBirth,
      gender,
      address,
      idType,
      idNumber,
      bankCode,
      accountNumber,
    } = regulatoryKyc;

    if (
      !storeName?.trim() ||
      !email?.trim() ||
      !phoneNumber?.trim() ||
      !legalFirstName?.trim() ||
      !legalLastName?.trim() ||
      !dateOfBirth?.trim() ||
      !['MALE', 'FEMALE', 'OTHER'].includes(String(gender)) ||
      !address?.trim() ||
      !['BVN', 'NIN'].includes(String(idType)) ||
      !/^\d{11}$/.test(String(idNumber || '').trim()) ||
      !bankCode?.trim() ||
      !/^\d{10}$/.test(String(accountNumber || '').trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Valid vendor profile, 11-digit BVN/NIN, date of birth, gender, address, and 10-digit settlement NUBAN are required.',
        },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (session.user.email !== normalizedEmail) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMAIL_MISMATCH',
          error: 'Forbidden: Onboarding email must match your signed-in vendor account email.',
        },
        { status: 403 }
      );
    }

    // 4. Check instant allowlist kill-switch (default open signup = false) + CAPTCHA verification
    const allowlistCheck = await checkInviteOnlyAllowlist(
      supabase,
      normalizedEmail,
      String(storeName),
      session.user.id
    );
    if (!allowlistCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: 'VENDOR_NOT_ALLOWLISTED',
          error: allowlistCheck.error,
        },
        { status: 403 }
      );
    }

    if (!allowlistCheck.allowlistMode || body.captchaToken !== undefined) {
      const captchaResult = await verifyPublicSignupCaptcha({
        token: body.captchaToken,
        remoteIp: ip,
      });
      if (!captchaResult.valid) {
        return NextResponse.json(
          {
            success: false,
            code: 'CAPTCHA_FAILED',
            error: captchaResult.error || 'CAPTCHA verification failed.',
          },
          { status: 400 }
        );
      }
    }

    // Normalize phone to +234 international format
    let cleanPhone = String(phoneNumber).replace(/\s+/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '+234' + cleanPhone.slice(1);
    }

    // 4b. Anchor bank account name enquiry + mandatory KYC legal name fuzzy-match
    const submittedAccountNameHint =
      regulatoryKyc.settlementAccountName ||
      `${String(legalFirstName).trim()} ${String(legalLastName).trim()}`.trim();

    const enquiry = await performAnchorNameEnquiry({
      bankCode: String(bankCode).trim(),
      accountNumber: String(accountNumber).trim(),
      accountNameHint: submittedAccountNameHint,
    });

    if (!enquiry.verified || !enquiry.resolvedAccountName) {
      return NextResponse.json(
        {
          success: false,
          code: 'PAYOUT_ACCOUNT_ENQUIRY_FAILED',
          error: enquiry.error || 'Unable to verify settlement bank account name with Anchor.',
        },
        { status: 422 }
      );
    }

    const nameMatch = await verifySettlementNameMatchesKyc({
      legalFirstName: String(legalFirstName).trim(),
      legalLastName: String(legalLastName).trim(),
      accountName: enquiry.resolvedAccountName,
    });

    if (!nameMatch.matched) {
      return NextResponse.json(
        {
          success: false,
          code: 'SETTLEMENT_NAME_MISMATCH',
          error: nameMatch.reason,
          nameMatchScore: nameMatch.score,
          minScoreRequired: nameMatch.minScoreRequired,
        },
        { status: 422 }
      );
    }

    let customerId: string | null =
      typeof allowlistCheck.existingVendor?.anchor_customer_id === 'string' &&
      allowlistCheck.existingVendor.anchor_customer_id.trim()
        ? allowlistCheck.existingVendor.anchor_customer_id.trim()
        : null;
    let accountId: string | null = null;
    // Note: kycStatus is strictly computed server-side from Anchor API result; any client field is ignored.
    let kycStatus = 'PENDING';

    // 5. Forward KYC PII strictly to Anchor BaaS in memory (never logged, never stored in Relyvora DB)
    try {
      if (!customerId) {
        const customerResult = await createAnchorCustomer({
          firstName: String(legalFirstName).trim(),
          lastName: String(legalLastName).trim(),
          email: normalizedEmail,
          phoneNumber: cleanPhone,
          address: {
            addressLine_1: String(address).trim(),
            city: 'Lagos',
            state: 'Lagos',
            country: 'NG',
            postalCode: '100001',
          },
        });
        customerId = customerResult.customerId;
      }

      // Immediately checkpoint anchor_customer_id so any retry is idempotent even if a later step fails
      if (customerId) {
        if (allowlistCheck.existingVendor?.id) {
          await supabase
            .from('vendors')
            .update({
              user_id: session.user.id,
              anchor_customer_id: customerId,
            })
            .eq('id', allowlistCheck.existingVendor.id);
        } else {
          await supabase.from('vendors').upsert(
            {
              user_id: session.user.id,
              store_name: String(storeName).trim(),
              email: normalizedEmail,
              phone_number: cleanPhone,
              phone_hash: hashPhoneSignal(cleanPhone),
              legal_first_name: String(legalFirstName).trim(),
              legal_last_name: String(legalLastName).trim(),
              settlement_bank_code: String(bankCode).trim(),
              settlement_account_number: String(accountNumber).trim(),
              settlement_account_name: enquiry.resolvedAccountName,
              anchor_customer_id: customerId,
              kyc_status: 'pending',
              is_allowlisted: Boolean(allowlistCheck.allowlistMode),
            },
            { onConflict: 'email' }
          );
        }
      }

      if (customerId) {
        const cleanIdNumber = String(idNumber).trim();
        const verifyRes = await verifyAnchorCustomer({
          customerId,
          level: 'TIER_2',
          bvn: idType === 'BVN' ? cleanIdNumber : undefined,
          nin: idType === 'NIN' ? cleanIdNumber : undefined,
          dateOfBirth: String(dateOfBirth).trim(),
          gender: String(gender).trim(),
        });
        const rawVerifyStatus = String(
          (verifyRes as any)?.data?.data?.status ||
            (verifyRes as any)?.data?.data?.attributes?.status ||
            (verifyRes as any)?.data?.status ||
            'PENDING'
        ).toUpperCase();
        kycStatus =
          rawVerifyStatus === 'VERIFIED'
            ? 'VERIFIED'
            : rawVerifyStatus === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING';
      }

      if (customerId) {
        const accountResult = await createAnchorDepositAccount({ customerId });
        accountId = accountResult.accountId;
      }

      await createAnchorCounterParty({
        accountName: enquiry.resolvedAccountName,
        accountNumber: String(accountNumber).trim(),
        bankCode: String(bankCode).trim(),
        verifyName: isLiveMode(),
      });
    } catch (anchorErr: any) {
      console.error('Anchor BaaS onboarding failed (fail closed):', anchorErr?.message || anchorErr);
      return NextResponse.json(
        {
          success: false,
          code: 'ANCHOR_ONBOARDING_FAILED',
          error: anchorErr?.message || 'Anchor BaaS KYC verification failed.',
        },
        { status: 502 }
      );
    }

    // 6. Persist ONLY non-PII operational vendor metadata to public.vendors atomically (no pre-migration overlay or user_id fallback).
    const dbKycStatus = kycStatus === 'VERIFIED' ? 'verified' : 'pending';
    const isExistingAllowlisted = Boolean(allowlistCheck.existingVendor?.is_allowlisted);
    const fps = await extractRequestDeviceFingerprints(request, body.deviceFingerprint);
    const phoneHash = hashPhoneSignal(cleanPhone);
    const acceptedNowIso = new Date().toISOString();
    const resolvedTier = allowlistCheck.existingVendor?.tier || 'NEW';
    const resolvedSalesCount = Math.max(
      Number(allowlistCheck.existingVendor?.successful_sales_count || 0),
      Number(allowlistCheck.existingVendor?.completed_orders_count || 0)
    );

    const vendorUpsertPayload = {
      user_id: session.user.id,
      store_name: String(storeName).trim(),
      email: normalizedEmail,
      phone_number: cleanPhone,
      phone_hash: phoneHash,
      phone_verified: Boolean(allowlistCheck.existingVendor?.phone_verified),
      legal_first_name: String(legalFirstName).trim(),
      legal_last_name: String(legalLastName).trim(),
      settlement_bank_code: String(bankCode).trim(),
      settlement_account_number: String(accountNumber).trim(),
      settlement_account_name: enquiry.resolvedAccountName,
      payout_account_verified: true,
      settlement_account_name_matched: true,
      settlement_name_match_score: nameMatch.score,
      anchor_customer_id: customerId,
      anchor_deposit_account_id: accountId,
      kyc_status: dbKycStatus,
      is_allowlisted: allowlistCheck.allowlistMode ? true : isExistingAllowlisted,
      tier: resolvedTier,
      successful_sales_count: resolvedSalesCount,
      signup_ip_hash: fps.ipHash,
      signup_ip_expires_at: fps.ipExpiresAt,
      signup_ua_hash: fps.uaHash,
      signup_device_hash: fps.deviceHash,
      terms_accepted_at: acceptedNowIso,
      terms_version: CONSENT_TERMS_VERSION,
      prohibited_items_accepted_at: acceptedNowIso,
      prohibited_items_version: CONSENT_TERMS_VERSION,
      signup_consent_ip_hash: fps.ipHash,
      updated_at: acceptedNowIso,
    };

    const { data: savedVendor, error: upsertError } = await supabase
      .from('vendors')
      .upsert(vendorUpsertPayload, { onConflict: 'email' })
      .select('id, store_name, kyc_status, is_allowlisted, tier')
      .single();

    if (upsertError || !savedVendor) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Onboarding Upsert Failed (Fail Closed)',
        details: { userId: session.user.id, error: upsertError?.message || 'Empty upsert result' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: `Failed to save vendor onboarding profile: ${upsertError?.message || 'Database error'}` },
        { status: 500 }
      );
    }

    let phoneVerificationWhatsappStatus: string = 'already_verified';
    if (!allowlistCheck.existingVendor?.phone_verified) {
      const templateApproved = await isReleaseCodeTemplateApprovedServer();
      if (!templateApproved) {
        phoneVerificationWhatsappStatus = 'pending_template_approval';
      } else {
        const waPhoneRes = await sendVendorPhoneVerifyWhatsapp(
          {
            vendorId: savedVendor.id,
            vendorDisplayName: String(storeName).trim(),
            vendorPhone: cleanPhone,
            maskedAccountHint: `******${String(accountNumber).trim().slice(-4)}`,
          },
          supabase
        );
        phoneVerificationWhatsappStatus = waPhoneRes.status;
      }
    }

    const maskedAccountNumber = `******${String(accountNumber).trim().slice(-4)}`;
    return NextResponse.json({
      success: true,
      message: 'Vendor onboarding and KYC verification completed successfully.',
      data: {
        vendorId: savedVendor.id,
        storeName: String(storeName).trim(),
        legalName: `${String(legalFirstName).trim()} ${String(legalLastName).trim()}`.trim(),
        kycStatus,
        dbKycStatus,
        tier: savedVendor.tier,
        termsAcceptedAt: acceptedNowIso,
        termsVersion: CONSENT_TERMS_VERSION,
        isAllowlisted: Boolean(savedVendor.is_allowlisted),
        phoneVerificationWhatsappStatus,
        nameMatchScore: nameMatch.score,
        settlement: {
          bankCode: String(bankCode).trim(),
          accountName: enquiry.resolvedAccountName,
          maskedAccountNumber,
          status: 'ACTIVE',
        },
      },
    });
  } catch (error: any) {
    console.error('Vendor onboarding error:', error?.message || 'Unexpected error');
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal Server Error during vendor onboarding.',
      },
      { status: 500 }
    );
  }
}
