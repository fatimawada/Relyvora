/**
 * Relyvora Schema Parity Proof
 *
 * Compares:
 *   (A) A fresh empty PGlite database built strictly from `docs/FULL-SCHEMA-FROM-SCRATCH.sql`
 *   (B) A PGlite simulation of Staging pre-delta (`supabase/schema.sql` + legacy `vendors`
 *       + `PHASE-G1-MIGRATION.sql` + `PHASE-G1.5-RLS-v3.sql` + `PHASE-G2.5-ADMIN-RPC-v2.sql`)
 *       upgraded with `docs/STAGING-ADDITIONS.sql`
 *
 * Also checks live remote Staging Supabase OpenAPI (`/rest/v1/`) to report which objects
 * in `docs/STAGING-ADDITIONS.sql` are currently pending execution in Staging SQL Editor.
 *
 * Run with memory cap on Windows:
 *   node --v8-pool-size=1 --liftoff-only --max-old-space-size=768 ... scripts/compare-schema.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { PGlite } from '@electric-sql/pglite';

async function createLowMemPGlite(): Promise<{ db: PGlite; cleanup: () => Promise<void> }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relyvora-pglite-'));
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
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

interface TableInfo {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
}

interface ConstraintInfo {
  table_name: string;
  constraint_name: string;
  contype: string;
  definition: string;
}

interface IndexInfo {
  table_name: string;
  index_name: string;
  index_def: string;
}

interface PolicyInfo {
  table_name: string;
  policy_name: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface PrivilegeSnapshot {
  table_privileges: Array<{ table_name: string; grantee: string; privilege_type: string }>;
  routine_privileges: Array<{ routine_name: string; grantee: string; privilege_type: string }>;
  matrix_tables: Array<{
    table_name: string;
    anon_select: boolean;
    anon_insert: boolean;
    anon_update: boolean;
    anon_delete: boolean;
    auth_select: boolean;
    auth_insert: boolean;
    auth_update: boolean;
    auth_delete: boolean;
  }>;
  matrix_functions: Array<{
    function_name: string;
    identity_args: string;
    anon_execute: boolean;
    auth_execute: boolean;
  }>;
}

interface FunctionInfo {
  function_name: string;
  identity_args: string;
  return_type: string;
  security_definer: boolean;
  proconfig: string[] | null;
}

interface TriggerInfo {
  table_name: string;
  trigger_name: string;
  action_timing: string;
  event_manipulation: string;
  action_orientation: string;
  action_statement: string;
}

interface SettingInfo {
  key: string;
  value_json: string;
}

interface SchemaSnapshot {
  tables: TableInfo[];
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
  policies: PolicyInfo[];
  privileges: PrivilegeSnapshot;
  functions: FunctionInfo[];
  triggers: TriggerInfo[];
  system_settings: SettingInfo[];
  enums: Array<{ enum_name: string; labels: string[] }>;
}

const ROLE_BOOTSTRAP_SQL = `
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
`;

function canonicalJson(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(canonicalJson).join(',') + ']';
  const entries = Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
}

async function extractSnapshot(db: PGlite): Promise<SchemaSnapshot> {
  const tablesRes = await db.query<TableInfo>(`
    SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  const columnsRes = await db.query<ColumnInfo>(`
    SELECT
        table_name,
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);

  const constraintsRes = await db.query<ConstraintInfo>(`
    SELECT
        c.relname AS table_name,
        con.conname AS constraint_name,
        con.contype::text AS contype,
        pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY c.relname, con.conname
  `);

  const indexesRes = await db.query<IndexInfo>(`
    SELECT
        tablename AS table_name,
        indexname AS index_name,
        indexdef AS index_def
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  const policiesRes = await db.query<PolicyInfo>(`
    SELECT
        tablename AS table_name,
        policyname AS policy_name,
        permissive,
        roles::text AS roles,
        cmd,
        qual,
        with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);

  const tblPrivRes = await db.query<{ table_name: string; grantee: string; privilege_type: string }>(`
    SELECT table_name, grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ORDER BY table_name, grantee, privilege_type
  `);

  const rtnPrivRes = await db.query<{ routine_name: string; grantee: string; privilege_type: string }>(`
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ORDER BY routine_name, grantee, privilege_type
  `);

  const matrixTblRes = await db.query<PrivilegeSnapshot['matrix_tables'][number]>(`
    SELECT
        c.relname AS table_name,
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
    ORDER BY c.relname
  `);

  const matrixFnRes = await db.query<PrivilegeSnapshot['matrix_functions'][number]>(`
    SELECT
        p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname, identity_args
  `);

  const functionsRes = await db.query<FunctionInfo>(`
    SELECT
        p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        pg_get_function_result(p.oid) AS return_type,
        p.prosecdef AS security_definer,
        p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname, identity_args
  `);

  const triggersRes = await db.query<TriggerInfo>(`
    SELECT
        event_object_table AS table_name,
        trigger_name,
        action_timing,
        string_agg(event_manipulation, ',' ORDER BY event_manipulation) AS event_manipulation,
        action_orientation,
        action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    GROUP BY event_object_table, trigger_name, action_timing, action_orientation, action_statement
    ORDER BY event_object_table, trigger_name
  `);

  const settingsRes = await db.query<{ key: string; value: unknown }>(`
    SELECT key, value
    FROM public.system_settings
    ORDER BY key
  `);

  const enumsRes = await db.query<{ enum_name: string; label: string }>(`
    SELECT t.typname AS enum_name, e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);

  const enumsMap = new Map<string, string[]>();
  for (const r of enumsRes.rows) {
    const arr = enumsMap.get(r.enum_name) || [];
    arr.push(r.label);
    enumsMap.set(r.enum_name, arr);
  }

  return {
    tables: tablesRes.rows,
    columns: columnsRes.rows,
    constraints: constraintsRes.rows,
    indexes: indexesRes.rows,
    policies: policiesRes.rows,
    privileges: {
      table_privileges: tblPrivRes.rows,
      routine_privileges: rtnPrivRes.rows,
      matrix_tables: matrixTblRes.rows,
      matrix_functions: matrixFnRes.rows,
    },
    functions: functionsRes.rows,
    triggers: triggersRes.rows,
    system_settings: settingsRes.rows.map((s) => ({
      key: s.key,
      value_json: canonicalJson(s.value),
    })),
    enums: Array.from(enumsMap.entries()).map(([enum_name, labels]) => ({ enum_name, labels })),
  };
}

function diffKeyed<T>(
  category: string,
  aRows: T[],
  bRows: T[],
  keyFn: (row: T) => string,
  serializeFn: (row: T) => string = (r) => canonicalJson(r)
): string[] {
  const diffs: string[] = [];
  const aMap = new Map<string, T>();
  const bMap = new Map<string, T>();

  for (const r of aRows) aMap.set(keyFn(r), r);
  for (const r of bRows) bMap.set(keyFn(r), r);

  const allKeys = Array.from(new Set([...aMap.keys(), ...bMap.keys()])).sort();
  for (const k of allKeys) {
    const aVal = aMap.get(k);
    const bVal = bMap.get(k);
    if (!aVal) {
      diffs.push(`[${category}] EXTRA in B (Staging+Additions): ${k} -> ${serializeFn(bVal!)}`);
    } else if (!bVal) {
      diffs.push(`[${category}] MISSING in B (Staging+Additions): ${k} -> ${serializeFn(aVal)}`);
    } else {
      const aStr = serializeFn(aVal);
      const bStr = serializeFn(bVal);
      if (aStr !== bStr) {
        diffs.push(`[${category}] MISMATCH on ${k}:\n    Fresh(A):   ${aStr}\n    Staging(B): ${bStr}`);
      }
    }
  }
  return diffs;
}

async function buildFreshDbSnapshot(): Promise<SchemaSnapshot> {
  const { db, cleanup } = await createLowMemPGlite();
  try {
    await db.exec(ROLE_BOOTSTRAP_SQL);
    const fullSql = fs.readFileSync(path.resolve(process.cwd(), 'docs', 'FULL-SCHEMA-FROM-SCRATCH.sql'), 'utf8');
    await db.exec(fullSql);
    return await extractSnapshot(db);
  } finally {
    await cleanup();
  }
}

async function buildStagingPlusAdditionsSnapshot(): Promise<SchemaSnapshot> {
  const { db, cleanup } = await createLowMemPGlite();
  try {
    await db.exec(ROLE_BOOTSTRAP_SQL);

    // Bootstrap baseline pre-delta Staging shape:
    // 1. Base transactions + trigger (supabase/schema.sql without uuid_generate_v4 mismatch issues — pgcrypto is built in PGlite)
    const baseSchema = fs
      .readFileSync(path.resolve(process.cwd(), 'supabase', 'schema.sql'), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/gi, '-- pgcrypto extension skipped in PGlite (gen_random_uuid is built in)');
    await db.exec(baseSchema);

    // 2. Legacy Staging public.vendors pre-G1.5 definition (matches live Staging OpenAPI metadata)
    await db.exec(`
      CREATE TYPE public.vendor_kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
      CREATE TABLE IF NOT EXISTS public.vendors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          store_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone_number VARCHAR(20) NOT NULL,
          legal_first_name VARCHAR(100),
          legal_last_name VARCHAR(100),
          date_of_birth DATE,
          gender VARCHAR(32),
          business_address TEXT,
          id_type VARCHAR(32),
          id_number VARCHAR(64),
          settlement_bank_code VARCHAR(10),
          settlement_account_number VARCHAR(10),
          anchor_customer_id VARCHAR(100) UNIQUE,
          kyc_status public.vendor_kyc_status NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Apply legacy incremental scripts that ran on Staging before STAGING-ADDITIONS.sql
    const g1Sql = fs.readFileSync(path.resolve(process.cwd(), 'docs', 'PHASE-G1-MIGRATION.sql'), 'utf8');
    await db.exec(g1Sql);

    const g15Sql = fs.readFileSync(path.resolve(process.cwd(), 'docs', 'PHASE-G1.5-RLS-v3.sql'), 'utf8');
    await db.exec(g15Sql);

    const g25Sql = fs.readFileSync(path.resolve(process.cwd(), 'docs', 'PHASE-G2.5-ADMIN-RPC-v2.sql'), 'utf8');
    await db.exec(g25Sql);

    // 4. Apply STAGING-ADDITIONS.sql (frozen delta) and verify idempotency with second run
    const additionsSql = fs.readFileSync(path.resolve(process.cwd(), 'docs', 'STAGING-ADDITIONS.sql'), 'utf8');
    await db.exec(additionsSql);
    await db.exec(additionsSql);

    return await extractSnapshot(db);
  } finally {
    await cleanup();
  }
}

async function inspectLiveRemoteStaging(expected: SchemaSnapshot): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.log('\n⚠️  Live Staging OpenAPI check skipped (.env.local missing).');
    return;
  }

  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    console.log(`\n⚠️  Live Staging OpenAPI fetch returned HTTP ${res.status}.`);
    return;
  }

  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
    paths?: Record<string, unknown>;
  };

  const liveTables = new Set(Object.keys(spec.definitions || {}));
  const expectedTables = expected.tables.map((t) => t.table_name);
  const missingLiveTables = expectedTables.filter((t) => !liveTables.has(t));

  const liveRpcs = new Set(
    Object.keys(spec.paths || {})
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.replace(/^\/rpc\//, ''))
  );
  const expectedRpcs = expected.functions
    .map((f) => f.function_name)
    .filter((fn) => fn.startsWith('rpc_'));
  const missingLiveRpcs = expectedRpcs.filter((fn) => !liveRpcs.has(fn));

  const missingLiveCols: string[] = [];
  for (const col of expected.columns) {
    const def = spec.definitions?.[col.table_name];
    if (!def) continue;
    if (!def.properties || !(col.column_name in def.properties)) {
      missingLiveCols.push(`${col.table_name}.${col.column_name}`);
    }
  }

  console.log('\n======================================================================');
  console.log(`LIVE REMOTE STAGING STATUS (${url}) BEFORE MANUAL STAGING-ADDITIONS.SQL`);
  console.log('======================================================================');
  console.log(`Live tables present: ${liveTables.size}/${expectedTables.length}`);
  console.log(`Missing live tables: ${missingLiveTables.length ? missingLiveTables.join(', ') : '(none)'}`);
  console.log(`Missing live RPCs:   ${missingLiveRpcs.length ? missingLiveRpcs.join(', ') : '(none)'}`);
  console.log(`Missing live cols:   ${missingLiveCols.length ? missingLiveCols.join(', ') : '(none)'}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dumpAIdx = args.indexOf('--dump-a');
  if (dumpAIdx !== -1 && args[dumpAIdx + 1]) {
    const snapA = await buildFreshDbSnapshot();
    fs.writeFileSync(args[dumpAIdx + 1], JSON.stringify(snapA), 'utf8');
    return;
  }
  const dumpBIdx = args.indexOf('--dump-b');
  if (dumpBIdx !== -1 && args[dumpBIdx + 1]) {
    const snapB = await buildStagingPlusAdditionsSnapshot();
    fs.writeFileSync(args[dumpBIdx + 1], JSON.stringify(snapB), 'utf8');
    return;
  }

  console.log('======================================================================');
  console.log('SCHEMA PARITY PROOF: FULL-SCHEMA-FROM-SCRATCH vs STAGING + ADDITIONS');
  console.log('======================================================================\n');

  const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relyvora-snap-'));
  const snapAPath = path.join(snapDir, 'snapA.json');
  const snapBPath = path.join(snapDir, 'snapB.json');
  let snapA: SchemaSnapshot;
  let snapB: SchemaSnapshot;
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'compare-schema.ts');
    const baseFlags = ['--v8-pool-size=1', '--liftoff-only', '--expose-gc', scriptPath];
    execFileSync(process.execPath, [...baseFlags, '--dump-a', snapAPath], { stdio: 'inherit' });
    execFileSync(process.execPath, [...baseFlags, '--dump-b', snapBPath], { stdio: 'inherit' });
    snapA = JSON.parse(fs.readFileSync(snapAPath, 'utf8')) as SchemaSnapshot;
    snapB = JSON.parse(fs.readFileSync(snapBPath, 'utf8')) as SchemaSnapshot;
  } finally {
    fs.rmSync(snapDir, { recursive: true, force: true });
  }

  const allDiffs: string[] = [];

  allDiffs.push(
    ...diffKeyed('ENUMS', snapA.enums, snapB.enums, (r) => r.enum_name)
  );
  allDiffs.push(
    ...diffKeyed('TABLES', snapA.tables, snapB.tables, (r) => r.table_name)
  );
  allDiffs.push(
    ...diffKeyed('COLUMNS', snapA.columns, snapB.columns, (r) => `${r.table_name}.${r.column_name}`)
  );
  allDiffs.push(
    ...diffKeyed('CONSTRAINTS', snapA.constraints, snapB.constraints, (r) => `${r.table_name}.${r.constraint_name}`)
  );
  allDiffs.push(
    ...diffKeyed('INDEXES', snapA.indexes, snapB.indexes, (r) => `${r.table_name}.${r.index_name}`)
  );
  allDiffs.push(
    ...diffKeyed('POLICIES', snapA.policies, snapB.policies, (r) => `${r.table_name}.${r.policy_name}`)
  );
  allDiffs.push(
    ...diffKeyed(
      'TABLE_PRIVS_PUBLIC_MAP',
      snapA.privileges.table_privileges,
      snapB.privileges.table_privileges,
      (r) => `${r.table_name}:${r.grantee}:${r.privilege_type}`
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'ROUTINE_PRIVS_PUBLIC_MAP',
      snapA.privileges.routine_privileges,
      snapB.privileges.routine_privileges,
      (r) => `${r.routine_name}:${r.grantee}:${r.privilege_type}`
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'TABLE_PRIV_MATRIX',
      snapA.privileges.matrix_tables,
      snapB.privileges.matrix_tables,
      (r) => r.table_name
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'FUNCTION_PRIV_MATRIX',
      snapA.privileges.matrix_functions,
      snapB.privileges.matrix_functions,
      (r) => `${r.function_name}(${r.identity_args})`
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'FUNCTIONS',
      snapA.functions,
      snapB.functions,
      (r) => `${r.function_name}(${r.identity_args})`
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'TRIGGERS',
      snapA.triggers,
      snapB.triggers,
      (r) => `${r.table_name}.${r.trigger_name}`
    )
  );
  allDiffs.push(
    ...diffKeyed(
      'SYSTEM_SETTINGS',
      snapA.system_settings,
      snapB.system_settings,
      (r) => r.key
    )
  );

  console.log(`Compared Enums:           A=${snapA.enums.length}, B=${snapB.enums.length}`);
  console.log(`Compared Tables:          A=${snapA.tables.length}, B=${snapB.tables.length}`);
  console.log(`Compared Columns:         A=${snapA.columns.length}, B=${snapB.columns.length}`);
  console.log(`Compared Constraints:     A=${snapA.constraints.length}, B=${snapB.constraints.length}`);
  console.log(`Compared Indexes:         A=${snapA.indexes.length}, B=${snapB.indexes.length}`);
  console.log(`Compared Policies:        A=${snapA.policies.length}, B=${snapB.policies.length}`);
  console.log(`Compared Functions:       A=${snapA.functions.length}, B=${snapB.functions.length}`);
  console.log(`Compared Triggers:        A=${snapA.triggers.length}, B=${snapB.triggers.length}`);
  console.log(`Compared system_settings: A=${snapA.system_settings.length}, B=${snapB.system_settings.length}`);
  console.log(`anon/auth/PUBLIC privs:   A(tbl=${snapA.privileges.table_privileges.length}, fn=${snapA.privileges.routine_privileges.length}), B(tbl=${snapB.privileges.table_privileges.length}, fn=${snapB.privileges.routine_privileges.length})`);

  console.log('\n--- PARITY DIFF RESULT ---');
  if (allDiffs.length === 0) {
    console.log('DIFF: <empty> (0 differences across all categories — 100% parity)');
  } else {
    console.error(`DIFF: ${allDiffs.length} difference(s) found:\n`);
    for (const d of allDiffs) {
      console.error(d);
    }
  }

  await inspectLiveRemoteStaging(snapA);

  if (allDiffs.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Schema parity script crashed:', err);
  process.exit(1);
});
