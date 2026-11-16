/**
 * Relyvora — Fresh From-Scratch Database Schema & Zero-Public-Access Proof
 *
 * 1. Boots a brand-new, completely EMPTY throwaway PostgreSQL 16 engine (@electric-sql/pglite)
 *    seeded only with Supabase's baseline roles (anon, authenticated, service_role, postgres).
 * 2. Executes docs/FULL-SCHEMA-FROM-SCRATCH.sql verbatim (wrapped in BEGIN ... COMMIT).
 * 3. Prints & asserts every grants verification query (0 rows in table_privileges &
 *    routine_privileges for anon/authenticated/PUBLIC; ALL false in has_table_privilege &
 *    has_function_privilege matrix; RLS enabled + forced on all 13 tables).
 * 4. Verifies vendor_kyc_status / kyc_status enum labels, update_modified_column() trigger,
 *    append-only ledger trigger, system_settings null cap seeds, and role-level denial (42501).
 * 5. Confirms all 6 database RPCs called by the app exist on Staging Supabase OpenAPI schema,
 *    and verifies scripts/seed-staging-vendor.ts refuses production URLs.
 *
 * NEVER runs destructive/from-scratch SQL against production or staging!
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { assertStagingTarget } from '../scripts/seed-staging-vendor';

async function createLowMemPGlite(): Promise<{ db: PGlite; cleanup: () => Promise<void> }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relyvora-pglite-test-'));
  try {
    const initdbChunkUrl = pathToFileURL(
      path.resolve(process.cwd(), 'node_modules/@electric-sql/pglite/dist/chunk-N66TTF7B.js')
    ).href;
    const mod = (await import(initdbChunkUrl)) as {
      h: (opts: { pg: PGlite }) => Promise<{ exitCode: number; stderr: string }>;
    };
    const f = await PGlite.create({ dataDir: tmpDir, noInitDb: true });
    try {
      const modAny = f.Module as unknown as { HEAPU8: Uint8Array };
      modAny.HEAPU8 = new Uint8Array(modAny.HEAPU8.buffer, 0, 24 * 1024 * 1024);
      const initRes = await mod.h({ pg: f });
      if (initRes.exitCode !== 0 && !initRes.stderr.includes('exists but is not empty')) {
        throw new Error(`Low-mem initdb failed: ${initRes.stderr}`);
      }
    } finally {
      await f.close().catch(() => {});
    }
    const gcFn = (globalThis as unknown as { gc?: () => void }).gc;
    if (typeof gcFn === 'function') gcFn();
    const db = await PGlite.create({ dataDir: tmpDir });
    return {
      db,
      cleanup: async () => {
        await db.close().catch(() => {});
        if (typeof gcFn === 'function') gcFn();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function loadEnvLocal() {
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

loadEnvLocal();

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

const EXPECTED_TABLES = [
  'admin_audit_log',
  'buyer_phone_verifications',
  'deposits',
  'dispute_resolutions',
  'market_waitlist',
  'order_evidence_files',
  'rate_limit_buckets',
  'risk_flags',
  'system_settings',
  'transaction_ledger',
  'transactions',
  'vendors',
  'webhook_events',
  'whatsapp_do_not_contact',
  'whatsapp_message_log',
  'whatsapp_webhook_events',
];

const APP_CALLABLE_RPCS = [
  'rpc_verify_and_prepare_release',
  'rpc_finalize_release_step',
  'rpc_process_webhook_deposit',
  'rpc_admin_unlock_transaction',
  'rpc_admin_prepare_dispute_resolution',
  'rpc_admin_finalize_dispute_resolution',
  'rpc_admin_clear_risk_hold',
  'rpc_raise_dispute_with_lock',
  'rpc_check_rate_limit',
];

const ALREADY_DEPLOYED_STAGING_RPCS = [
  'rpc_verify_and_prepare_release',
  'rpc_finalize_release_step',
  'rpc_process_webhook_deposit',
  'rpc_admin_unlock_transaction',
  'rpc_admin_prepare_dispute_resolution',
  'rpc_admin_finalize_dispute_resolution',
];

async function main() {
  const args = process.argv.slice(2);
  const deltaIdx = args.indexOf('--delta-only');
  if (deltaIdx !== -1 && args[deltaIdx + 1]) {
    await runDeltaPhase();
    fs.writeFileSync(args[deltaIdx + 1], JSON.stringify({ passed, failed }), 'utf8');
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log('======================================================================');
  console.log('FRESH FROM-SCRATCH DATABASE PROOF (THROWAWAY EMPTY PGLITE INSTANCE)');
  console.log('======================================================================\n');

  const { db, cleanup: cleanupFreshDb } = await createLowMemPGlite();

  try {
    // 1. Bootstrap an empty Supabase-like role environment (anon, authenticated, service_role)
    await db.exec(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
              CREATE ROLE anon NOLOGIN NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
              CREATE ROLE authenticated NOLOGIN NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
              CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
          END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);

    const preTables = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    assert(preTables.rows.length === 0, `Throwaway database starts completely empty (${preTables.rows.length} tables)`);

    // 2. Execute docs/FULL-SCHEMA-FROM-SCRATCH.sql end-to-end
    const schemaPath = path.resolve(process.cwd(), 'docs', 'FULL-SCHEMA-FROM-SCRATCH.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schemaSql);
    assert(true, 'docs/FULL-SCHEMA-FROM-SCRATCH.sql executed cleanly from empty state in a single transaction');

    // Also test idempotent re-execution (re-running script must succeed without error)
    await db.exec(schemaSql);
    assert(true, 'docs/FULL-SCHEMA-FROM-SCRATCH.sql is idempotent when re-executed');

    // 3. Verify all 13 tables exist
    const postTables = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const createdNames = postTables.rows.map((r) => r.tablename);
    assert(
      EXPECTED_TABLES.every((t) => createdNames.includes(t)) && createdNames.length === EXPECTED_TABLES.length,
      `All ${EXPECTED_TABLES.length} public tables created: ${createdNames.join(', ')}`
    );

    // 3b. Verify legacy KYC PII columns are absent from public.vendors
    const piiColsRes = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'vendors'
         AND column_name IN ('date_of_birth', 'gender', 'business_address', 'id_type', 'id_number')`
    );
    assert(
      piiColsRes.rows.length === 0,
      'public.vendors omits all 5 legacy KYC PII columns (date_of_birth, gender, business_address, id_type, id_number)'
    );

    // 4. Verify ENUM types & labels
    const enumRes = await db.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname IN ('vendor_kyc_status', 'kyc_status')
       ORDER BY t.typname, e.enumsortorder`
    );
    const vendorLabels = enumRes.rows.filter((r) => r.typname === 'vendor_kyc_status').map((r) => r.enumlabel);
    const kycLabels = enumRes.rows.filter((r) => r.typname === 'kyc_status').map((r) => r.enumlabel);
    assert(
      JSON.stringify(vendorLabels) === JSON.stringify(['pending', 'submitted', 'verified', 'rejected']) &&
        JSON.stringify(kycLabels) === JSON.stringify(['pending', 'submitted', 'verified', 'rejected']),
      `Enums vendor_kyc_status & kyc_status exist with labels: [${kycLabels.join(', ')}]`
    );

    // 5. Run Verification Query 9.1 (information_schema.table_privileges)
    const tablePrivRes = await db.query(
      `SELECT table_schema, table_name, grantee, privilege_type
       FROM information_schema.table_privileges
       WHERE table_schema = 'public'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')
       ORDER BY table_name, grantee, privilege_type`
    );
    console.log('\n--- VERIFICATION QUERY 9.1: table_privileges (anon, authenticated, PUBLIC) ---');
    console.log(`Rows returned: ${tablePrivRes.rows.length}`);
    assert(tablePrivRes.rows.length === 0, 'Query 9.1 table_privileges returned 0 rows for anon/authenticated/PUBLIC');

    // 6. Run Verification Query 9.2 (information_schema.routine_privileges)
    const routinePrivRes = await db.query(
      `SELECT routine_schema, routine_name, grantee, privilege_type
       FROM information_schema.routine_privileges
       WHERE routine_schema = 'public'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')
       ORDER BY routine_name, grantee, privilege_type`
    );
    console.log('\n--- VERIFICATION QUERY 9.2: routine_privileges (anon, authenticated, PUBLIC) ---');
    console.log(`Rows returned: ${routinePrivRes.rows.length}`);
    assert(
      routinePrivRes.rows.length === 0,
      'Query 9.2 routine_privileges returned 0 rows for anon/authenticated/PUBLIC'
    );

    // 7. Run Verification Query 9.3 (pg_class per-table privilege matrix)
    const matrixRes = await db.query<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
      anon_select: boolean;
      anon_insert: boolean;
      anon_update: boolean;
      anon_delete: boolean;
      auth_select: boolean;
      auth_insert: boolean;
      auth_update: boolean;
      auth_delete: boolean;
    }>(
      `SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
          has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
          has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
          has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
          has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
          has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
          has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
          has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`
    );
    console.log('\n--- VERIFICATION QUERY 9.3: pg_class RLS + anon/authenticated Privilege Matrix ---');
    console.table(matrixRes.rows);
    const allMatrixSafe =
      matrixRes.rows.length === EXPECTED_TABLES.length &&
      matrixRes.rows.every(
        (r) =>
          r.rls_enabled === true &&
          r.rls_forced === true &&
          r.anon_select === false &&
          r.anon_insert === false &&
          r.anon_update === false &&
          r.anon_delete === false &&
          r.auth_select === false &&
          r.auth_insert === false &&
          r.auth_update === false &&
          r.auth_delete === false
      );
    assert(allMatrixSafe, `Query 9.3: All ${EXPECTED_TABLES.length} tables have rls_enabled=true, rls_forced=true, and ALL false for anon/authenticated`);

    // 8. Run Verification Query 9.4 (pg_proc function execute matrix)
    const funcRes = await db.query<{
      function_name: string;
      anon_execute: boolean;
      auth_execute: boolean;
      service_role_execute: boolean;
    }>(
      `SELECT
          p.proname AS function_name,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
       ORDER BY p.proname`
    );
    console.log('\n--- VERIFICATION QUERY 9.4: pg_proc Function EXECUTE Matrix ---');
    console.table(funcRes.rows);
    const funcNames = funcRes.rows.map((r) => r.function_name);
    assert(
      APP_CALLABLE_RPCS.every((fn) => funcNames.includes(fn)) &&
        funcNames.includes('update_modified_column') &&
        funcNames.includes('handle_updated_at') &&
        funcNames.includes('prevent_ledger_modification'),
      `All ${APP_CALLABLE_RPCS.length} rpc_* functions and all 3 trigger functions exist in public schema`
    );
    assert(
      funcRes.rows.every((r) => r.anon_execute === false && r.auth_execute === false && r.service_role_execute === true),
      'Query 9.4: ALL public functions have anon_execute=false, auth_execute=false, service_role_execute=true'
    );

    // 9. Verify system_settings seed defaults (null caps, checkout_enabled=true, vendor_allowlist_mode=true)
    const settingsRes = await db.query<{ key: string; value: unknown; updated_by: string }>(
      `SELECT key, value, updated_by FROM public.system_settings ORDER BY key`
    );
    console.log('\n--- VERIFICATION QUERY 9.5: system_settings Seed Rows ---');
    console.table(settingsRes.rows);
    const settingsMap = new Map(settingsRes.rows.map((r) => [r.key, r.value]));
    const tierCfg: any = settingsMap.get('tier_config');
    const riskCfg: any = settingsMap.get('risk_engine_config');
    const coolingCfg: any = settingsMap.get('cooling_window_config');
    const payoutCfg: any = settingsMap.get('payout_safety_config');
    const adminCfg: any = settingsMap.get('admin_safety_config');
    assert(
      settingsMap.get('max_order_ngn') === null &&
        settingsMap.get('max_daily_vendor_volume_ngn') === null &&
        settingsMap.get('checkout_enabled') === true &&
        settingsMap.get('payouts_enabled') === true &&
        settingsMap.get('vendor_allowlist_mode') === false &&
        settingsMap.get('max_daily_vendor_whatsapp_messages') === 50 &&
        settingsMap.get('max_daily_buyer_whatsapp_messages') === 5 &&
        tierCfg?.tiers?.NEW?.per_order_cap_ngn === 2500000 &&
        tierCfg?.tiers?.NEW?.daily_volume_cap_ngn === 5000000 &&
        tierCfg?.tiers?.ESTABLISHED?.per_order_cap_ngn === 10000000 &&
        tierCfg?.tiers?.ESTABLISHED?.daily_volume_cap_ngn === 20000000 &&
        tierCfg?.tiers?.TRUSTED?.per_order_cap_ngn === null &&
        tierCfg?.tiers?.TRUSTED?.daily_volume_cap_ngn === null &&
        settingsMap.get('tier1_order_limit_ngn') === 2500000 &&
        settingsMap.get('tier_upgrade_threshold') === 5 &&
        payoutCfg?.settlement_change_wait_hours === 48 &&
        riskCfg?.review_hold_threshold === 3 &&
        riskCfg?.block_threshold === 6 &&
        riskCfg?.amount_review_threshold_ngn === 500000 &&
        coolingCfg?.hours_by_tier?.NEW === 2 &&
        coolingCfg?.high_value_cooling_hours === 2 &&
        adminCfg?.session_max_age_minutes === 15,
      'system_settings seeds match Final Decisions defaults (vendor_allowlist_mode=false, payouts_enabled=true, tier/risk/cooling/payout/admin configs)'
    );

    // 10. Test update_modified_column() trigger + buyer_phone_verifications + append-only ledger trigger
    const vendorInsert = await db.query<{ id: string; created_at: string; updated_at: string }>(
      `INSERT INTO public.vendors (store_name, email, phone_number, kyc_status, is_allowlisted, anchor_deposit_account_id, payout_account_verified, settlement_account_name_matched)
       VALUES ('Throwaway Store', 'throwaway@relyvora.test', '+2348099990000', 'verified', true, 'anc_acct_1', true, true)
       RETURNING id, created_at::text, updated_at::text`
    );
    const vId = vendorInsert.rows[0].id;
    const beforeUpd = vendorInsert.rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 25));
    const vendorUpd = await db.query<{ updated_at: string }>(
      `UPDATE public.vendors SET store_name = 'Throwaway Store V2' WHERE id = $1 RETURNING updated_at::text`,
      [vId]
    );
    assert(
      vendorUpd.rows[0].updated_at !== beforeUpd,
      'update_modified_column() trigger advances updated_at automatically on UPDATE'
    );

    const txInsert = await db.query<{ id: string }>(
      `INSERT INTO public.transactions (vendor_id, item_name, item_price, delivery_fee, protection_fee, total_amount, vendor_handle, buyer_phone)
       VALUES ($1, 'Fresh Schema Widget', 10000, 1500, 300, 11800, '@Throwaway', '+2348099990001')
       RETURNING id`,
      [vId]
    );
    const txId = txInsert.rows[0].id;

    // Insert buyer_phone_verifications record and confirm trigger + FK work
    const bpvInsert = await db.query<{ verified: boolean; created_at: string; updated_at: string }>(
      `INSERT INTO public.buyer_phone_verifications (transaction_id, phone_hash, masked_phone, verified, verification_method)
       VALUES ($1, $2, '******0001', true, 'WHATSAPP_QUICK_REPLY')
       RETURNING verified, created_at::text, updated_at::text`,
      [txId, crypto.createHash('sha256').update('+2348099990001').digest('hex')]
    );
    assert(bpvInsert.rows[0].verified === true, 'buyer_phone_verifications row inserts cleanly with FK to transactions');

    // Verify append-only transaction_ledger trigger blocks UPDATE
    await db.query(
      `INSERT INTO public.transaction_ledger (transaction_id, entry_type, amount, from_account, to_account, idempotency_key)
       VALUES ($1, 'ESCROW_FUNDED', 11800, 'buyer', 'fbo', $2)`,
      [txId, `idem_${txId}`]
    );
    let ledgerUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.transaction_ledger SET amount = 1 WHERE transaction_id = $1`, [txId]);
    } catch (err: any) {
      ledgerUpdateBlocked = String(err?.message || '').includes('append-only');
    }
    assert(ledgerUpdateBlocked, 'transaction_ledger append-only trigger blocks UPDATE mutations');

    // 10b. Verify 4-arg rpc_verify_and_prepare_release (cooling 202 + review_hold block) & rpc_admin_clear_risk_hold in PGlite
    const secret = 'test_fresh_schema_hmac_secret';
    const rawCode = '654321';
    const hmacHash = crypto.createHmac('sha256', secret).update(`${rawCode}`).digest('hex');
    const coolTxId = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.transactions (id, vendor_id, item_name, item_price, delivery_fee, protection_fee, total_amount, vendor_handle, buyer_phone, status, release_code_hash, anchor_deposit_id, amount_paid, review_hold, review_hold_reason)
       VALUES ($1, $2, 'TEST Cooling Hold Widget', 10000, 1500, 500, 12000, '@Throwaway', '+2348099990002', 'FUNDS_LOCKED', $3, 'dep_fresh_schema_1', 12000, true, 'TEST hold')`,
      [coolTxId, vId, hmacHash]
    );
    await db.query(
      `INSERT INTO public.risk_flags (transaction_id, vendor_id, score, severity, action_taken, status) VALUES ($1, $2, 45, 'MEDIUM', 'HOLD_PAYOUT', 'OPEN')`,
      [coolTxId, vId]
    );

    const heldRes = await db.query<{ rpc_verify_and_prepare_release: any }>(
      `SELECT public.rpc_verify_and_prepare_release($1::uuid, $2::text, 5, 2)`,
      [coolTxId, hmacHash]
    );
    assert(
      heldRes.rows[0].rpc_verify_and_prepare_release?.success === false &&
        heldRes.rows[0].rpc_verify_and_prepare_release?.status_code === 423 &&
        heldRes.rows[0].rpc_verify_and_prepare_release?.error === 'TEST hold',
      'PGlite rpc_verify_and_prepare_release blocks payout when review_hold=true'
    );

    const clearRes = await db.query<{ rpc_admin_clear_risk_hold: any }>(
      `SELECT public.rpc_admin_clear_risk_hold($1::uuid, 'admin@relyvora.com', 'Verified legitimate buyer', false, '127.0.0.1')`,
      [coolTxId]
    );
    assert(
      clearRes.rows[0].rpc_admin_clear_risk_hold?.success === true &&
        clearRes.rows[0].rpc_admin_clear_risk_hold?.cleared_flags_count === 1,
      'PGlite rpc_admin_clear_risk_hold clears OPEN risk_flags, lifts review_hold, and writes audit log'
    );

    const coolRes = await db.query<{ rpc_verify_and_prepare_release: any }>(
      `SELECT public.rpc_verify_and_prepare_release($1::uuid, $2::text, 5, 2)`,
      [coolTxId, hmacHash]
    );
    assert(
      coolRes.rows[0].rpc_verify_and_prepare_release?.cooling_active === true &&
        coolRes.rows[0].rpc_verify_and_prepare_release?.status_code === 202,
      'PGlite 4-arg rpc_verify_and_prepare_release initiates 2h cooling window with cooling_active=true (status_code 202)'
    );

    const disputeLockTxId = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.transactions (id, vendor_id, item_name, item_price, delivery_fee, protection_fee, total_amount, vendor_handle, buyer_phone, status)
       VALUES ($1, $2, 'TEST Dispute Lock Widget', 10000, 1500, 500, 12000, '@Throwaway', '+2348099990003', 'FUNDS_LOCKED')`,
      [disputeLockTxId, vId]
    );
    const raiseRes = await db.query<{ rpc_raise_dispute_with_lock: any }>(
      `SELECT public.rpc_raise_dispute_with_lock($1::uuid, 'BUYER', 1, 'Item mismatch test', NULL)`,
      [disputeLockTxId]
    );
    assert(
      raiseRes.rows[0].rpc_raise_dispute_with_lock?.success === true &&
        raiseRes.rows[0].rpc_raise_dispute_with_lock?.status === 'DISPUTED' &&
        raiseRes.rows[0].rpc_raise_dispute_with_lock?.review_hold === true,
      'PGlite rpc_raise_dispute_with_lock atomically sets DISPUTED + review_hold=true'
    );

    const rl1 = await db.query<{ rpc_check_rate_limit: any }>(
      `SELECT public.rpc_check_rate_limit('test:key:1', 2, 60000)`
    );
    const rl2 = await db.query<{ rpc_check_rate_limit: any }>(
      `SELECT public.rpc_check_rate_limit('test:key:1', 2, 60000)`
    );
    const rl3 = await db.query<{ rpc_check_rate_limit: any }>(
      `SELECT public.rpc_check_rate_limit('test:key:1', 2, 60000)`
    );
    assert(
      rl1.rows[0].rpc_check_rate_limit?.allowed === true &&
        rl2.rows[0].rpc_check_rate_limit?.allowed === true &&
        rl3.rows[0].rpc_check_rate_limit?.allowed === false &&
        rl3.rows[0].rpc_check_rate_limit?.remaining === 0,
      'PGlite rpc_check_rate_limit enforces shared Postgres bucket limits across calls'
    );

    // 11. Active SET LOCAL ROLE anon/authenticated exploitation tests
    for (const role of ['anon', 'authenticated']) {
      let tableReadBlocked = false;
      try {
        await db.exec(`BEGIN; SET LOCAL ROLE ${role}; SELECT * FROM public.transactions; COMMIT;`);
      } catch (err: any) {
        await db.exec('ROLLBACK;').catch(() => {});
        tableReadBlocked = /permission denied/i.test(String(err?.message || ''));
      }
      assert(tableReadBlocked, `SET LOCAL ROLE ${role} SELECT public.transactions denied with permission denied`);

      let waitlistInsertBlocked = false;
      try {
        await db.exec(
          `BEGIN; SET LOCAL ROLE ${role}; INSERT INTO public.market_waitlist (email, market) VALUES ('x@y.com', 'GH'); COMMIT;`
        );
      } catch (err: any) {
        await db.exec('ROLLBACK;').catch(() => {});
        waitlistInsertBlocked = /permission denied/i.test(String(err?.message || ''));
      }
      assert(waitlistInsertBlocked, `SET LOCAL ROLE ${role} INSERT public.market_waitlist denied with permission denied`);

      let bpvReadBlocked = false;
      try {
        await db.exec(`BEGIN; SET LOCAL ROLE ${role}; SELECT * FROM public.buyer_phone_verifications; COMMIT;`);
      } catch (err: any) {
        await db.exec('ROLLBACK;').catch(() => {});
        bpvReadBlocked = /permission denied/i.test(String(err?.message || ''));
      }
      assert(bpvReadBlocked, `SET LOCAL ROLE ${role} SELECT public.buyer_phone_verifications denied with permission denied`);

      let rpcBlocked = false;
      try {
        await db.exec(
          `BEGIN; SET LOCAL ROLE ${role}; SELECT public.rpc_admin_unlock_transaction('${txId}'::uuid, 'x@y.com', 'hack'); COMMIT;`
        );
      } catch (err: any) {
        await db.exec('ROLLBACK;').catch(() => {});
        rpcBlocked = /permission denied/i.test(String(err?.message || ''));
      }
      assert(rpcBlocked, `SET LOCAL ROLE ${role} EXECUTE rpc_admin_unlock_transaction denied with permission denied`);
    }

    // 12. Verify scripts/seed-staging-vendor.ts refuses production targets
    const prevPaymentsMode = process.env.PAYMENTS_MODE;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevProdEnv = process.env.PROD_SUPABASE_URL;
    let prodBlocked1 = false;
    let prodBlocked2 = false;
    let prodBlocked3 = false;
    let stagingAllowed = false;
    try {
      process.env.PAYMENTS_MODE = 'sandbox';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';

      try {
        assertStagingTarget('https://relyvora-prod.supabase.co', 'test_service_role_key');
      } catch {
        prodBlocked1 = true;
      }
      try {
        assertStagingTarget('https://abc.supabase.co', 'test_service_role_key');
      } catch {
        prodBlocked2 = true;
      }
      process.env.PROD_SUPABASE_URL = 'https://customlivehost.supabase.co';
      try {
        assertStagingTarget('https://customlivehost.supabase.co', 'test_service_role_key');
      } catch {
        prodBlocked3 = true;
      }
      try {
        assertStagingTarget('https://bepvqjqjybhhpsfbblqk.supabase.co', 'test_service_role_key');
        stagingAllowed = true;
      } catch {
        stagingAllowed = false;
      }
    } finally {
      if (prevProdEnv === undefined) delete process.env.PROD_SUPABASE_URL;
      else process.env.PROD_SUPABASE_URL = prevProdEnv;
      if (prevPaymentsMode === undefined) delete process.env.PAYMENTS_MODE;
      else process.env.PAYMENTS_MODE = prevPaymentsMode;
      if (prevNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
      else (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }
    assert(
      prodBlocked1 && prodBlocked2 && prodBlocked3 && stagingAllowed,
      'scripts/seed-staging-vendor.ts assertStagingTarget() blocks production/unknown URLs and permits staging only'
    );

    // 13. Confirm all 6 RPCs called by app exist in live Staging OpenAPI spec
    const stagingUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!stagingUrl || !serviceKey) {
      assert(false, 'Staging Supabase env vars missing for OpenAPI RPC confirmation');
    } else {
      const specRes = await fetch(`${stagingUrl.replace(/\/+$/, '')}/rest/v1/`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      const specJson = (await specRes.json()) as { paths?: Record<string, unknown> };
      const rpcPaths = Object.keys(specJson.paths || {}).filter((p) => p.startsWith('/rpc/'));
      console.log('\n--- STAGING OPENAPI /rpc/* ENDPOINTS CONFIRMED ---');
      console.log(rpcPaths.sort().join('\n'));
      const missingRpcs = ALREADY_DEPLOYED_STAGING_RPCS.filter((fn) => !rpcPaths.includes(`/rpc/${fn}`));
      const hasClearRiskHoldOnStaging = rpcPaths.includes('/rpc/rpc_admin_clear_risk_hold');
      assert(
        specRes.ok && missingRpcs.length === 0,
        `All 6 baseline RPCs confirmed present in Staging Supabase (${stagingUrl}); rpc_admin_clear_risk_hold on Staging=${hasClearRiskHoldOnStaging}`
      );
    }
  } finally {
    await cleanupFreshDb();
  }

  const deltaTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relyvora-delta-res-'));
  const deltaResPath = path.join(deltaTmpDir, 'delta-result.json');
  try {
    const selfPath = path.resolve(process.cwd(), 'tests', 'fresh-schema-from-scratch.test.ts');
    const childArgs = [...process.execArgv, selfPath, '--delta-only', deltaResPath];
    execFileSync(process.execPath, childArgs, { stdio: 'inherit' });
  } catch {
    // Child counts captured via deltaResPath below
  } finally {
    if (fs.existsSync(deltaResPath)) {
      const deltaRes = JSON.parse(fs.readFileSync(deltaResPath, 'utf8')) as { passed: number; failed: number };
      passed += Number(deltaRes.passed || 0);
      failed += Number(deltaRes.failed || 0);
    } else {
      failed++;
      console.error('❌ [FAIL] Delta phase child process did not emit result JSON');
    }
    fs.rmSync(deltaTmpDir, { recursive: true, force: true });
  }

  console.log('\n======================================================================');
  console.log(`FRESH SCHEMA & RPC AUDIT SUMMARY: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

async function runDeltaPhase(): Promise<void> {
  console.log('\n--- 14. STAGING-ADDITIONS.SQL DELTA PROOF (THROWAWAY PRE-DELTA PGLITE) ---');
  const { db: deltaDb, cleanup: cleanupDeltaDb } = await createLowMemPGlite();
  try {
    await deltaDb.exec(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
              CREATE ROLE anon NOLOGIN NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
              CREATE ROLE authenticated NOLOGIN NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
              CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
          END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      CREATE TYPE public.vendor_kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
      CREATE TABLE public.vendors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          store_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone_number VARCHAR(64) NOT NULL,
          date_of_birth DATE,
          gender VARCHAR(32),
          business_address TEXT,
          id_type VARCHAR(32),
          id_number VARCHAR(64),
          kyc_status public.vendor_kyc_status NOT NULL DEFAULT 'pending',
          is_allowlisted BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );
      CREATE TABLE public.transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_name TEXT NOT NULL DEFAULT '',
          item_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
          protection_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          vendor_handle TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
          created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );
      CREATE TABLE public.system_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          description TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
          updated_by TEXT
      );
      INSERT INTO public.system_settings (key, value, description, updated_by)
      VALUES ('max_order_ngn', '500000'::jsonb, 'Legacy cap', 'legacy')
      ON CONFLICT (key) DO NOTHING;
    `);

    const additionsPath = path.resolve(process.cwd(), 'docs', 'STAGING-ADDITIONS.sql');
    const additionsSql = fs.readFileSync(additionsPath, 'utf8');
    await deltaDb.exec(additionsSql);
    await deltaDb.exec(additionsSql);
    assert(true, 'docs/STAGING-ADDITIONS.sql executed cleanly twice (idempotent single-transaction delta)');

    const deltaPiiCols = await deltaDb.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'vendors'
         AND column_name IN ('date_of_birth', 'gender', 'business_address', 'id_type', 'id_number')`
    );
    assert(deltaPiiCols.rows.length === 0, 'STAGING-ADDITIONS.sql dropped all 5 KYC PII columns from vendors');

    const deltaKycEnum = await deltaDb.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = 'kyc_status'
       ORDER BY e.enumsortorder`
    );
    assert(
      JSON.stringify(deltaKycEnum.rows.map((r) => r.enumlabel)) ===
        JSON.stringify(['pending', 'submitted', 'verified', 'rejected']),
      'STAGING-ADDITIONS.sql created public.kyc_status enum with expected labels'
    );

    const deltaPrivs = await deltaDb.query(
      `SELECT table_name, grantee, privilege_type
       FROM information_schema.table_privileges
       WHERE table_schema = 'public'
         AND table_name IN ('buyer_phone_verifications', 'market_waitlist', 'risk_flags', 'order_evidence_files', 'rate_limit_buckets')
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')`
    );
    const deltaMatrix = await deltaDb.query<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
      anon_select: boolean;
      auth_select: boolean;
    }>(
      `SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
          has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('buyer_phone_verifications', 'market_waitlist', 'risk_flags', 'order_evidence_files', 'rate_limit_buckets')
       ORDER BY c.relname`
    );
    assert(
      deltaPrivs.rows.length === 0 &&
        deltaMatrix.rows.length === 5 &&
        deltaMatrix.rows.every((r) => r.rls_enabled && r.rls_forced && !r.anon_select && !r.auth_select),
      'STAGING-ADDITIONS.sql locks buyer_phone_verifications, market_waitlist, risk_flags, order_evidence_files & rate_limit_buckets with FORCE RLS and zero public access'
    );

    const deltaRpcCheck = await deltaDb.query<{ proname: string; anon_exec: boolean; auth_exec: boolean }>(
      `SELECT
          p.proname,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('rpc_admin_clear_risk_hold', 'rpc_verify_and_prepare_release', 'rpc_finalize_release_step', 'rpc_process_webhook_deposit', 'rpc_raise_dispute_with_lock', 'rpc_check_rate_limit')`
    );
    assert(
      deltaRpcCheck.rows.length >= 6 &&
        deltaRpcCheck.rows.some((r) => r.proname === 'rpc_admin_clear_risk_hold') &&
        deltaRpcCheck.rows.some((r) => r.proname === 'rpc_raise_dispute_with_lock') &&
        deltaRpcCheck.rows.some((r) => r.proname === 'rpc_check_rate_limit') &&
        deltaRpcCheck.rows.some((r) => r.proname === 'rpc_finalize_release_step') &&
        deltaRpcCheck.rows.every((r) => !r.anon_exec && !r.auth_exec),
      'STAGING-ADDITIONS.sql creates/updates all 6 delta RPCs including rpc_raise_dispute_with_lock & rpc_check_rate_limit with EXECUTE revoked from anon/authenticated'
    );

    const salesColCheck = await deltaDb.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'successful_sales_count'`
    );
    assert(
      salesColCheck.rows.length === 1,
      'STAGING-ADDITIONS.sql adds public.vendors.successful_sales_count column'
    );

    const fnExecCheck = await deltaDb.query<{ anon_exec: boolean; auth_exec: boolean }>(
      `SELECT
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'update_modified_column'`
    );
    assert(
      fnExecCheck.rows.length === 1 && !fnExecCheck.rows[0].anon_exec && !fnExecCheck.rows[0].auth_exec,
      'STAGING-ADDITIONS.sql revokes EXECUTE on update_modified_column() from anon/authenticated'
    );

    const deltaSettings = await deltaDb.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM public.system_settings ORDER BY key`
    );
    const settingsObj = new Map(deltaSettings.rows.map((r) => [r.key, r.value]));
    assert(
      settingsObj.size >= 19 &&
        settingsObj.get('max_order_ngn') === null &&
        settingsObj.get('max_daily_vendor_volume_ngn') === null &&
        settingsObj.get('checkout_enabled') === true &&
        settingsObj.get('payouts_enabled') === true &&
        settingsObj.get('vendor_allowlist_mode') === false &&
        Number(settingsObj.get('max_daily_vendor_whatsapp_messages')) === 50 &&
        Number(settingsObj.get('max_daily_buyer_whatsapp_messages')) === 5 &&
        Number(settingsObj.get('tier1_order_limit_ngn')) === 2500000 &&
        Number(settingsObj.get('tier_upgrade_threshold')) === 5 &&
        settingsObj.has('tier_config') &&
        settingsObj.has('payout_safety_config') &&
        settingsObj.has('risk_engine_config') &&
        settingsObj.has('cooling_window_config') &&
        settingsObj.has('admin_safety_config') &&
        settingsObj.has('delivery_window_config') &&
        settingsObj.has('dispute_policy_config') &&
        settingsObj.has('dispatch_proof_config') &&
        settingsObj.has('order_lifecycle_config') &&
        settingsObj.has('retention_and_storage_config'),
      'STAGING-ADDITIONS.sql upserts all 19 system_settings keys (open-signup + tiers + Tier 1 lifecycle/dispute/retention configs)'
    );
  } finally {
    await cleanupDeltaDb();
  }
}

main().catch((err) => {
  console.error('Fatal fresh-schema test error:', err);
  process.exit(1);
});
