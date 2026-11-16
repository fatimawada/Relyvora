/**
 * Relyvora Staging Test Data Cleanup & Labeling Script
 *
 * Strictly restricted to Staging (`https://bepvqjqjybhhpsfbblqk.supabase.co`).
 * - Refuses production or unknown Supabase URLs via `assertStagingTarget`.
 * - Removes test webhook/deposit/log/DNC/audit rows and deletable test transactions.
 * - For any test transaction locked by the immutable `transaction_ledger` trigger,
 *   updates `item_name` to begin with `TEST - ` and `resolution_notes = 'TEST'`.
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { assertStagingTarget } from './seed-staging-vendor';
import { hashWhatsappPhone } from '../lib/whatsapp';

function loadEnvLocalIfMissing() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function isTestTransactionRow(row: {
  item_name?: string | null;
  vendor_handle?: string | null;
}): boolean {
  const handle = (row.vendor_handle || '').trim().toLowerCase();
  const item = (row.item_name || '').trim();
  if (
    handle === '@stagingtestvendor' ||
    handle === '@hacker' ||
    handle === '@testvendor' ||
    handle.startsWith('@testopenshop') ||
    handle.startsWith('@opensignuptest') ||
    handle.startsWith('@test_t1_vendor')
  ) {
    return true;
  }
  return /^(TEST\b|RC\s)/i.test(item) || /\btest\b|exploit|malicious/i.test(item);
}

export async function cleanupStagingTestData() {
  loadEnvLocalIfMissing();
  const { supabaseUrl, serviceRoleKey } = assertStagingTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Clean up test phone DNC / WhatsApp log / webhook artifacts
  const knownTestPhones = [
    '+2348011112222',
    '+2348033334444',
    '+2348055556666',
    '+2348099991234',
    '+2348000000001',
  ];
  const testPhoneHashes = knownTestPhones.map((p) => hashWhatsappPhone(p));

  await supabase.from('whatsapp_do_not_contact').delete().in('phone_hash', testPhoneHashes);
  await supabase.from('whatsapp_message_log').delete().in('recipient_phone_hash', testPhoneHashes);
  await supabase.from('whatsapp_message_log').delete().ilike('vendor_handle', '@StagingTestVendor');

  // Remove RC / test webhook events
  await supabase.from('webhook_events').delete().ilike('event_id', 'evt_%');
  await supabase.from('webhook_events').delete().ilike('event_id', '%test%');
  await supabase.from('whatsapp_webhook_events').delete().ilike('event_key', '%test%');
  await supabase.from('whatsapp_webhook_events').delete().ilike('event_key', '%notme%');
  await supabase.from('whatsapp_webhook_events').delete().ilike('event_key', '%rc_%');

  // 2. Fetch candidate transactions and delete or label as TEST
  const { data: allTx, error: txFetchErr } = await supabase
    .from('transactions')
    .select('id, item_name, vendor_handle, resolution_notes')
    .limit(500);

  if (txFetchErr) {
    throw new Error(`Failed querying staging transactions for cleanup: ${txFetchErr.message}`);
  }

  const testTxRows = (allTx || []).filter(isTestTransactionRow);
  let deletedCount = 0;
  let labeledRetainedCount = 0;

  for (const tx of testTxRows) {
    await supabase.from('risk_flags').delete().eq('transaction_id', tx.id);
    await supabase.from('whatsapp_message_log').delete().eq('transaction_id', tx.id);
    await supabase.from('buyer_phone_verifications').delete().eq('transaction_id', tx.id);
    await supabase.from('dispute_resolutions').delete().eq('transaction_id', tx.id);
    await supabase.from('deposits').delete().eq('transaction_id', tx.id);
    await supabase.from('admin_audit_log').delete().eq('target_id', tx.id);

    const { error: delErr } = await supabase.from('transactions').delete().eq('id', tx.id);
    if (!delErr) {
      deletedCount++;
    } else {
      const existingName = (tx.item_name || '').trim();
      const updatedName = /^TEST\b/i.test(existingName)
        ? existingName
        : `TEST - ${existingName || 'Ledger Test Order'}`;
      await supabase
        .from('transactions')
        .update({
          item_name: updatedName,
          resolution_notes: 'TEST',
        })
        .eq('id', tx.id);
      labeledRetainedCount++;
    }
  }

  // 3. Remove any non-@StagingTestVendor synthetic test vendor rows while keeping @StagingTestVendor labeled TEST
  const { data: vendorRows } = await supabase
    .from('vendors')
    .select('id, store_name, email, anchor_customer_id')
    .or(
      'email.ilike.%test%,store_name.ilike.TEST%,store_name.ilike.@OpenSignupTest%,store_name.ilike.@TestOpenShop%,anchor_customer_id.ilike.anc_cst_open_test%'
    );

  let removedDummyVendors = 0;
  for (const v of vendorRows || []) {
    if (String(v.store_name || '').toLowerCase() !== '@stagingtestvendor') {
      await supabase.from('risk_flags').delete().eq('vendor_id', v.id);
      await supabase.from('whatsapp_message_log').delete().eq('vendor_id', v.id);
      await supabase.from('admin_audit_log').delete().eq('target_id', v.id);
      // Detach any ledger-retained TEST transactions pointing to this synthetic vendor before deleting
      await supabase.from('transactions').update({ vendor_id: null }).eq('vendor_id', v.id);
      const { error: vDelErr } = await supabase.from('vendors').delete().eq('id', v.id);
      if (!vDelErr) removedDummyVendors++;
    }
  }

  console.log('======================================================================');
  console.log('STAGING TEST DATA CLEANUP SUMMARY');
  console.log(`Target: ${supabaseUrl}`);
  console.log(`Test transactions inspected: ${testTxRows.length}`);
  console.log(`Test transactions deleted: ${deletedCount}`);
  console.log(`Ledger-retained transactions labeled TEST: ${labeledRetainedCount}`);
  console.log(`Dummy synthetic vendor rows deleted: ${removedDummyVendors}`);
  console.log('======================================================================');
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/cleanup-staging-test-data.ts');
if (isDirectRun) {
  cleanupStagingTestData().catch((err) => {
    console.error('❌ Staging cleanup error:', err?.message || err);
    process.exitCode = 1;
  });
}
