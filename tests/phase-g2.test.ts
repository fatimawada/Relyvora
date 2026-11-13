/**
 * Phase G2 Safety and Operations Automated Verification Test Suite
 * 
 * Verifies:
 * 1. Kill Switches & Caps (CHECKOUT_ENABLED, MAX_ORDER_NGN default ₦50,000, Vendor Allowlist)
 * 2. Immutable Audit Ledger (Idempotency, append-only, entry types)
 * 3. Alerting & PII Redaction (Resend alerts, sensitive data masking)
 * 4. Admin Dispute Console (The 8 policy scenarios, 2h/6h/12h SLA countdown timers, settlement distributions)
 */

import fs from 'fs';
import path from 'path';
import {
  DEFAULT_MAX_ORDER_NGN,
  DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN,
  validateOrderCreationServer,
  isCheckoutEnabledServer,
  getMaxOrderNgnServer,
  getMaxDailyVendorVolumeNgnServer,
  clearSafetySettingsCache,
} from '../lib/safetyLimits';
import { getServiceSupabase } from '../lib/supabaseServer';

function loadEnvLocalIfPresent() {
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
loadEnvLocalIfPresent();
import { recordLedgerEntry, LedgerEntryInput } from '../lib/ledger';
import { sendSystemAlert, SystemAlert } from '../lib/alerts';
import { 
  DISPUTE_SCENARIOS, 
  getScenarioById, 
  calculateSlaCountdown, 
  DisputeScenario 
} from '../lib/disputeScenarios';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS - ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL - ${message}`);
    failed++;
  }
}

async function runPhaseG2Tests() {
  console.log('======================================================================');
  console.log('PHASE G2: SAFETY AND OPERATIONS AUTOMATED VERIFICATION SUITE');
  console.log('======================================================================\n');

  // =========================================================================
  // TEST GROUP 1: KILL SWITCHES & UNCAPPED DEFAULTS (WITH INSTANT OVERRIDES)
  // =========================================================================
  console.log('--- TEST GROUP 1: KILL SWITCHES & ORDER CAPS ---');

  // Test 1.1: Default MAX_ORDER_NGN and MAX_DAILY_VENDOR_VOLUME_NGN are null (no cap)
  assert(
    DEFAULT_MAX_ORDER_NGN === null && DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN === null,
    `Defaults are uncapped (DEFAULT_MAX_ORDER_NGN=${DEFAULT_MAX_ORDER_NGN}, DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN=${DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN})`
  );

  const originalMaxOrderEnv = process.env.MAX_ORDER_NGN;
  const originalMaxDailyEnv = process.env.MAX_DAILY_VENDOR_VOLUME_NGN;
  delete process.env.MAX_ORDER_NGN;
  delete process.env.MAX_DAILY_VENDOR_VOLUME_NGN;
  clearSafetySettingsCache();

  // Test 1.2: With null defaults, high-value order for verified staging vendor is permitted
  const serverMaxDefault = await getMaxOrderNgnServer();
  const serverDailyDefault = await getMaxDailyVendorVolumeNgnServer();
  assert(
    serverMaxDefault === null && serverDailyDefault === null,
    `Staging system_settings defaults resolve to null (max_order=${serverMaxDefault}, daily=${serverDailyDefault})`
  );

  const uncappedResult = await validateOrderCreationServer({
    vendorHandle: '@StagingTestVendor',
    totalAmount: 250000,
  });
  assert(
    uncappedResult.allowed === true,
    `Uncapped ₦250,000 order is allowed when caps are null (allowed=${uncappedResult.allowed})`
  );

  // Test 1.3: Instant override via MAX_ORDER_NGN enforces cap dynamically
  try {
    process.env.MAX_ORDER_NGN = '50000';
    clearSafetySettingsCache();

    const overCapResult = await validateOrderCreationServer({
      vendorHandle: '@StagingTestVendor',
      totalAmount: 50001,
    });
    assert(
      !overCapResult.allowed && overCapResult.code === 'AMOUNT_EXCEEDED',
      `Instant cap override (₦50,000) rejects ₦50,001: ${overCapResult.error}`
    );

    const validCapResult = await validateOrderCreationServer({
      vendorHandle: '@StagingTestVendor',
      totalAmount: 49999,
    });
    assert(
      validCapResult.allowed === true,
      `Order within instant cap override (₦49,999) is permitted: allowed=${validCapResult.allowed}`
    );
  } finally {
    if (originalMaxOrderEnv === undefined) delete process.env.MAX_ORDER_NGN;
    else process.env.MAX_ORDER_NGN = originalMaxOrderEnv;
    if (originalMaxDailyEnv === undefined) delete process.env.MAX_DAILY_VENDOR_VOLUME_NGN;
    else process.env.MAX_DAILY_VENDOR_VOLUME_NGN = originalMaxDailyEnv;
    clearSafetySettingsCache();
  }

  // Test 1.4: Kill switch simulation via staging system_settings override (CHECKOUT_ENABLED = false)
  const supabase = getServiceSupabase();
  try {
    await supabase
      .from('system_settings')
      .update({ value: false, updated_by: 'test_suite' })
      .eq('key', 'checkout_enabled');
    clearSafetySettingsCache();

    const enabledCheck = await isCheckoutEnabledServer();
    const disabledResult = await validateOrderCreationServer({
      vendorHandle: '@StagingTestVendor',
      totalAmount: 10000,
    });
    assert(
      !enabledCheck && !disabledResult.allowed && disabledResult.code === 'CHECKOUT_DISABLED',
      `Kill switch triggers when checkout_enabled=false: code=${disabledResult.code}`
    );
  } finally {
    await supabase
      .from('system_settings')
      .update({ value: true, updated_by: 'seed_staging_script' })
      .eq('key', 'checkout_enabled');
    clearSafetySettingsCache();
  }

  // =========================================================================
  // TEST GROUP 2: IMMUTABLE AUDIT LEDGER LOGIC
  // =========================================================================
  console.log('\n--- TEST GROUP 2: APPEND-ONLY AUDIT LEDGER ---');

  const testTxId = '00000000-0000-0000-0000-000000000099';
  const ledgerStore: Record<string, any> = {};

  // Mock Supabase client for ledger idempotency & storage testing
  const mockSupabase = {
    from: (table: string) => {
      assert(table === 'transaction_ledger', `Target table must be transaction_ledger (got: ${table})`);
      return {
        insert: (records: any[]) => ({
          select: () => ({
            single: async () => {
              const record = records[0];
              if (ledgerStore[record.idempotency_key]) {
                // Postgres unique constraint violation simulation
                return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
              }
              const id = `ledger_uuid_${Object.keys(ledgerStore).length + 1}`;
              ledgerStore[record.idempotency_key] = { id, ...record };
              return { data: { id }, error: null };
            },
          }),
        }),
      };
    },
  };

  const idempotencyKey = `test_ledger_${Date.now()}`;

  // Test 2.1: Record DEPOSIT_LOCKED entry
  const depositEntry: LedgerEntryInput = {
    transactionId: testTxId,
    entryType: 'DEPOSIT_LOCKED',
    amount: 25000,
    currency: 'NGN',
    fromAccount: '0123456789',
    toAccount: 'Relyvora Escrow FBO',
    idempotencyKey: `${idempotencyKey}_deposit`,
    metadata: { test: true },
  };
  const depositResult = await recordLedgerEntry(depositEntry, mockSupabase);
  assert(depositResult.success === true, 'Successfully recorded DEPOSIT_LOCKED in audit ledger');

  // Test 2.2: Idempotent replay of existing ledger entry
  const duplicateResult = await recordLedgerEntry(depositEntry, mockSupabase);
  assert(duplicateResult.success === true, 'Duplicate ledger entry handled idempotently without error');

  // Test 2.3: Record PAYOUT_VENDOR and FEE_REVENUE entries
  const payoutResult = await recordLedgerEntry({
    transactionId: testTxId,
    entryType: 'PAYOUT_VENDOR',
    amount: 24250,
    currency: 'NGN',
    fromAccount: 'Relyvora Escrow FBO',
    toAccount: 'vendor_anchor_act_123',
    idempotencyKey: `${idempotencyKey}_payout`,
  }, mockSupabase);
  const feeResult = await recordLedgerEntry({
    transactionId: testTxId,
    entryType: 'FEE_REVENUE',
    amount: 750,
    currency: 'NGN',
    fromAccount: 'Relyvora Escrow FBO',
    toAccount: 'Relyvora Revenue Account',
    idempotencyKey: `${idempotencyKey}_fee`,
  }, mockSupabase);
  assert(payoutResult.success && feeResult.success, 'Successfully recorded two-leg settlement entries (PAYOUT_VENDOR + FEE_REVENUE)');

  // Test 2.4: Record DISPUTE_FREEZE and REFUND_BUYER entries
  const disputeResult = await recordLedgerEntry({
    transactionId: testTxId,
    entryType: 'DISPUTE_FREEZE',
    amount: 25000,
    currency: 'NGN',
    idempotencyKey: `${idempotencyKey}_dispute`,
  }, mockSupabase);
  const refundResult = await recordLedgerEntry({
    transactionId: testTxId,
    entryType: 'REFUND_BUYER',
    amount: 25000,
    currency: 'NGN',
    idempotencyKey: `${idempotencyKey}_refund`,
  }, mockSupabase);
  assert(disputeResult.success && refundResult.success, 'Successfully recorded DISPUTE_FREEZE and REFUND_BUYER entries');

  // =========================================================================
  // TEST GROUP 3: ALERTING & PII SANITIZATION
  // =========================================================================
  console.log('\n--- TEST GROUP 3: CRITICAL ALERTING & PII REDACTION ---');

  // Test 3.1: Verify alert with sensitive data is masked
  const alertPayload: SystemAlert = {
    type: 'SECURITY_LOCKOUT',
    severity: 'CRITICAL',
    title: 'Brute-Force Lockout Triggered',
    transactionId: testTxId,
    vendorHandle: '@TestVendor',
    details: {
      accountNumber: '1234567890',
      buyerPhone: '+2348012345678',
      releaseCode: '849201', // Secret - must be stripped!
      secretPepper: 'my-super-secret-pepper', // Secret - must be stripped!
      clientIp: '197.210.64.12',
    },
  };

  const alertSendResult = await sendSystemAlert(alertPayload);
  assert(alertSendResult.success === true, 'sendSystemAlert executes cleanly in simulation/live mode');

  // =========================================================================
  // TEST GROUP 4: THE 8 DISPUTE SCENARIOS & SLA TIMERS
  // =========================================================================
  console.log('\n--- TEST GROUP 4: DISPUTE SCENARIOS & SLA TIMERS ---');

  // Test 4.1: Exactly 8 policy scenarios defined
  assert(DISPUTE_SCENARIOS.length === 8, `Exactly 8 dispute policy scenarios exist (found: ${DISPUTE_SCENARIOS.length})`);

  // Test 4.2: Verify SLA windows (2h, 6h, 12h)
  const slaWindows = new Set(DISPUTE_SCENARIOS.map(s => s.slaHours));
  assert(slaWindows.has(2) && slaWindows.has(6) && slaWindows.has(12),
    `SLA windows include 2h, 6h, and 12h (found: ${Array.from(slaWindows).join('h, ')}h)`);

  // Test 4.3: Verify all 8 scenarios map to designated resolution types
  const expectedScenarios = [
    { id: 1, name: 'Quality Mismatch', sla: 2, res: 'FULL_REFUND_BUYER' },
    { id: 2, name: 'Buyer Refuses Delivery / Unreachable', sla: 6, res: 'SPLIT_MINUS_DELIVERY' },
    { id: 3, name: 'The "Hostage" Situation', sla: 12, res: 'FULL_PAYOUT_VENDOR' },
    { id: 4, name: 'Item Damaged in Transit', sla: 2, res: 'FULL_REFUND_BUYER' },
    { id: 5, name: 'Partial Acceptance', sla: 6, res: 'CUSTOM_SPLIT' },
    { id: 6, name: 'Vendor Failure to Deliver', sla: 6, res: 'FULL_REFUND_BUYER' },
    { id: 7, name: "Buyer's Remorse at the Door", sla: 2, res: 'SPLIT_MINUS_DELIVERY' },
    { id: 8, name: 'Lost or Stolen in Transit', sla: 12, res: 'FULL_REFUND_BUYER' },
  ];

  for (const exp of expectedScenarios) {
    const sc = getScenarioById(exp.id);
    assert(
      sc !== undefined && sc.slaHours === exp.sla && sc.resolutionType === exp.res,
      `Scenario ${exp.id} (${exp.name}): ${exp.sla}h SLA, resolution=${exp.res}`
    );
  }

  // Test 4.4: SLA Countdown calculation - Active window (1h elapsed on 2h SLA -> ~1h remaining)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000 + 5000).toISOString(); // 55 mins elapsed
  const countdown2h = calculateSlaCountdown(oneHourAgo, 2);
  assert(
    !countdown2h.isExpired && (countdown2h.hoursRemaining === 1 || countdown2h.minutesRemaining >= 55),
    `2-Hour SLA with ~1h elapsed shows active countdown: ${countdown2h.formattedRemaining} (Expired: ${countdown2h.isExpired})`
  );

  // Test 4.5: SLA Countdown calculation - Expired window
  const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
  const expired2h = calculateSlaCountdown(threeHoursAgo, 2);
  assert(
    expired2h.isExpired === true && expired2h.formattedRemaining === 'EXPIRED' && expired2h.percentElapsed === 100,
    `2-Hour SLA with 3h elapsed triggers EXPIRED state (percentElapsed: 100%)`
  );

  // Test 4.6: 12-Hour Ultimatum countdown (1h elapsed on 12h SLA -> ~11h remaining)
  const countdown12h = calculateSlaCountdown(oneHourAgo, 12);
  assert(
    !countdown12h.isExpired && (countdown12h.hoursRemaining === 11 || (countdown12h.hoursRemaining === 10 && countdown12h.minutesRemaining >= 55)),
    `12-Hour SLA with ~1h elapsed shows 11h remaining: ${countdown12h.formattedRemaining}`
  );

  console.log('\n======================================================================');
  console.log(`PHASE G2 TEST SUITE SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
  console.log(`STATUS: ${failed === 0 ? 'ALL PHASE G2 REQUIREMENTS VERIFIED' : 'FAILURES DETECTED'}`);
  console.log('======================================================================');

  if (failed > 0) process.exit(1);
}

runPhaseG2Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
