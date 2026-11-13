/**
 * Staging Database Seeder for Relyvora Release Candidate Verification
 *
 * Strictly restricted to the staging Supabase project (`https://bepvqjqjybhhpsfbblqk.supabase.co`).
 * Refuses to execute against production or when PAYMENTS_MODE=live / NODE_ENV=production.
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_STAGING_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';

function loadEnvLocalIfMissing() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function assertStagingTarget(
  supabaseUrl: string | undefined,
  serviceRoleKey: string | undefined
): { supabaseUrl: string; serviceRoleKey: string } {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
  const paymentsMode = (process.env.PAYMENTS_MODE || '').toLowerCase().trim();

  if (nodeEnv === 'production' || paymentsMode === 'live') {
    throw new Error(
      `REFUSING SEED: Cannot run staging seed when NODE_ENV=${nodeEnv || 'unset'} or PAYMENTS_MODE=${paymentsMode || 'unset'}.`
    );
  }

  if (!supabaseUrl || !supabaseUrl.trim()) {
    throw new Error('REFUSING SEED: NEXT_PUBLIC_SUPABASE_URL is missing.');
  }

  const normalizedUrl = supabaseUrl.trim().replace(/\/+$/, '');
  if (/prod|production|relyvora\.com/i.test(normalizedUrl)) {
    throw new Error(
      `REFUSING SEED: Production-like Supabase URL blocked (${normalizedUrl}).`
    );
  }

  const allowOverride = process.env.ALLOW_STAGING_URL_OVERRIDE === 'true';
  if (normalizedUrl !== EXPECTED_STAGING_URL && !allowOverride) {
    throw new Error(
      `REFUSING SEED: Target Supabase URL (${normalizedUrl}) does not match expected staging project (${EXPECTED_STAGING_URL}).`
    );
  }

  if (!serviceRoleKey || !serviceRoleKey.trim()) {
    throw new Error('REFUSING SEED: SUPABASE_SERVICE_ROLE_KEY is missing.');
  }

  return { supabaseUrl: normalizedUrl, serviceRoleKey: serviceRoleKey.trim() };
}

async function seedStaging() {
  loadEnvLocalIfMissing();

  const { supabaseUrl, serviceRoleKey } = assertStagingTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Seeding staging database at ${supabaseUrl}...`);

  // 1. Seed / reset system_settings with uncapped null defaults
  // Note: PostgREST maps JSON `null` to SQL NULL (violating value JSONB NOT NULL),
  // so existing JSONB `'null'::jsonb` rows (row.value === null) are preserved as-is,
  // while missing or numeric rows are written as JSON string 'null' (parsed as null by safetyLimits).
  const now = new Date().toISOString();
  const { error: settingsErr } = await supabase
    .from('system_settings')
    .upsert(
      [
        {
          key: 'checkout_enabled',
          value: true,
          description: 'Master kill switch for checkout link creation and payments',
          updated_by: 'seed_staging_script',
          updated_at: now,
        },
        {
          key: 'vendor_allowlist_mode',
          value: true,
          description: 'When true, only vendors with is_allowlisted = true can create links',
          updated_by: 'seed_staging_script',
          updated_at: now,
        },
      ],
      { onConflict: 'key' }
    );

  if (settingsErr) {
    throw new Error(`Failed to upsert system_settings booleans: ${settingsErr.message}`);
  }

  for (const [capKey, desc] of [
    ['max_order_ngn', 'Optional maximum order limit in NGN (null = no cap)'],
    ['max_daily_vendor_volume_ngn', 'Optional per-vendor daily transaction volume ceiling in NGN (null = no cap)'],
  ] as const) {
    const { data: existingCap, error: capReadErr } = await supabase
      .from('system_settings')
      .select('key, value')
      .eq('key', capKey)
      .maybeSingle();

    if (capReadErr) {
      throw new Error(`Failed reading ${capKey}: ${capReadErr.message}`);
    }

    if (!existingCap) {
      const { error: insErr } = await supabase.from('system_settings').insert({
        key: capKey,
        value: 'null',
        description: desc,
        updated_by: 'seed_staging_script',
        updated_at: now,
      });
      if (insErr) throw new Error(`Failed inserting ${capKey}: ${insErr.message}`);
    } else if (existingCap.value !== null && existingCap.value !== 'null') {
      const { error: updErr } = await supabase
        .from('system_settings')
        .update({ value: 'null', updated_by: 'seed_staging_script', updated_at: now })
        .eq('key', capKey);
      if (updErr) throw new Error(`Failed resetting ${capKey}: ${updErr.message}`);
    }
  }
  console.log('Seeded system_settings (max_order_ngn=null, max_daily_vendor_volume_ngn=null).');

  // Seed WhatsApp daily rate limits (non-destructive if already set)
  for (const [waKey, waVal, waDesc] of [
    ['max_daily_vendor_whatsapp_messages', 50, 'Maximum outbound WhatsApp messages a single vendor can trigger per UTC day'],
    ['max_daily_buyer_whatsapp_messages', 5, 'Maximum outbound WhatsApp messages sent to a single buyer phone number per UTC day'],
  ] as const) {
    const { data: existingWa } = await supabase
      .from('system_settings')
      .select('key')
      .eq('key', waKey)
      .maybeSingle();

    if (!existingWa) {
      await supabase.from('system_settings').insert({
        key: waKey,
        value: waVal,
        description: waDesc,
        updated_by: 'seed_staging_script',
        updated_at: now,
      });
    }
  }

  // 2. Idempotently upsert deterministic staging vendor @StagingTestVendor
  const vendorPayload = {
    store_name: '@StagingTestVendor',
    email: 'staging-vendor@relyvora.com',
    phone_number: '+2348000000001',
    legal_first_name: 'Staging',
    legal_last_name: 'Vendor',
    kyc_status: 'verified',
    is_allowlisted: true,
    anchor_deposit_account_id: 'anc_staging_acc_001',
    settlement_bank_code: '058',
    settlement_account_number: '0123456789',
    settlement_account_name: 'Staging Test Vendor',
    daily_volume_ngn: 0,
    daily_volume_reset_at: now,
    updated_at: now,
  };

  const { data: existingVendors, error: findErr } = await supabase
    .from('vendors')
    .select('id, store_name')
    .ilike('store_name', '@StagingTestVendor')
    .limit(1);

  if (findErr) {
    throw new Error(`Failed querying vendors: ${findErr.message}`);
  }

  if (existingVendors && existingVendors.length > 0) {
    const existingId = existingVendors[0].id;
    const { error: updateErr } = await supabase
      .from('vendors')
      .update(vendorPayload)
      .eq('id', existingId);
    if (updateErr) {
      throw new Error(`Failed updating staging vendor ${existingId}: ${updateErr.message}`);
    }
    console.log(`Updated verified staging vendor @StagingTestVendor (id=${existingId}).`);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('vendors')
      .insert(vendorPayload)
      .select('id')
      .single();
    if (insertErr) {
      throw new Error(`Failed inserting staging vendor: ${insertErr.message}`);
    }
    console.log(`Inserted verified staging vendor @StagingTestVendor (id=${inserted.id}).`);
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed-staging-vendor.ts');
if (isDirectRun) {
  seedStaging().catch((err) => {
    console.error('❌ Staging seed error:', err.message || err);
    process.exit(1);
  });
}
