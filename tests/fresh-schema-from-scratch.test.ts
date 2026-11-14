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
import path from 'path';
import crypto from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { assertStagingTarget } from '../scripts/seed-staging-vendor';

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
];

async function main() {
  console.log('======================================================================');
  console.log('FRESH FROM-SCRATCH DATABASE PROOF (THROWAWAY EMPTY PGLITE INSTANCE)');
  console.log('======================================================================\n');

  const db = new PGlite();

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
    assert(allMatrixSafe, 'Query 9.3: All 13 tables have rls_enabled=true, rls_forced=true, and ALL false for anon/authenticated');

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
      'All 6 rpc_* functions and all 3 trigger functions exist in public schema'
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
    assert(
      settingsMap.get('max_order_ngn') === null &&
        settingsMap.get('max_daily_vendor_volume_ngn') === null &&
        settingsMap.get('checkout_enabled') === true &&
        settingsMap.get('vendor_allowlist_mode') === true &&
        settingsMap.get('max_daily_vendor_whatsapp_messages') === 50 &&
        settingsMap.get('max_daily_buyer_whatsapp_messages') === 5,
      'system_settings seeds match release-candidate uncapped defaults'
    );

    // 10. Test update_modified_column() trigger + buyer_phone_verifications + append-only ledger trigger
    const vendorInsert = await db.query<{ id: string; created_at: string; updated_at: string }>(
      `INSERT INTO public.vendors (store_name, email, phone_number, kyc_status, is_allowlisted, anchor_deposit_account_id)
       VALUES ('Throwaway Store', 'throwaway@relyvora.test', '+2348099990000', 'verified', true, 'anc_acct_1')
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
      const missingRpcs = APP_CALLABLE_RPCS.filter((fn) => !rpcPaths.includes(`/rpc/${fn}`));
      assert(
        specRes.ok && missingRpcs.length === 0,
        `All 6 app RPCs confirmed present in Staging Supabase (${stagingUrl}): ${APP_CALLABLE_RPCS.join(', ')}`
      );
    }
  } finally {
    await db.close();
  }

  console.log('\n======================================================================');
  console.log(`FRESH SCHEMA & RPC AUDIT SUMMARY: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Fatal fresh-schema test error:', err);
  process.exitCode = 1;
});
