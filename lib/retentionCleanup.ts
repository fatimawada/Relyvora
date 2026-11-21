/**
 * Automated Data Retention & NDPA Storage Cleanup Engine
 * Executed periodically inside `/api/cron/reconcile`.
 */

import { getServiceSupabase } from '@/lib/supabaseServer';
import { getRetentionAndStorageConfig, EVIDENCE_BUCKET_NAME } from '@/lib/evidenceStorage';
import { logInfo } from '@/lib/logger';
import { sendSystemAlert } from '@/lib/alerts';

export interface RetentionCleanupReport {
  timestamp: string;
  expiredIpRowsScrubbed: number;
  evidenceFilesPurged: number;
  whatsappLogsPurged: number;
  rateLimitBucketsPruned: number;
}

export async function runRetentionCleanup(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<RetentionCleanupReport> {
  const supabase = supabaseClient || getServiceSupabase();
  const cfg = await getRetentionAndStorageConfig(supabase);
  const nowIso = new Date().toISOString();
  let expiredIpRowsScrubbed = 0;
  let evidenceFilesPurged = 0;
  let whatsappLogsPurged = 0;
  let rateLimitBucketsPruned = 0;

  try {
    // 1. Scrub expired hashed IP/UA/device fingerprints on transactions
    const { data: creatorExpired, error: creatorErr } = await supabase
      .from('transactions')
      .update({ creator_ip_hash: null, creator_ua_hash: null, creator_device_hash: null })
      .lt('creator_ip_expires_at', nowIso)
      .not('creator_ip_hash', 'is', null)
      .select('id');
    if (creatorErr) throw new Error(`Creator IP hash scrub failed: ${creatorErr.message}`);
    expiredIpRowsScrubbed += Array.isArray(creatorExpired) ? creatorExpired.length : 0;

    const { data: buyerExpired, error: buyerErr } = await supabase
      .from('transactions')
      .update({ buyer_ip_hash: null, buyer_ua_hash: null, buyer_device_hash: null })
      .lt('buyer_ip_expires_at', nowIso)
      .not('buyer_ip_hash', 'is', null)
      .select('id');
    if (buyerErr) throw new Error(`Buyer IP hash scrub failed: ${buyerErr.message}`);
    expiredIpRowsScrubbed += Array.isArray(buyerExpired) ? buyerExpired.length : 0;

    // 2. Purge evidence objects older than retention_delete_after (180d default)
    const { data: expiredFiles, error: evSelErr } = await supabase
      .from('order_evidence_files')
      .select('id, storage_bucket, storage_object_path')
      .lt('retention_delete_after', nowIso)
      .is('deleted_at', null)
      .limit(100);
    if (evSelErr) throw new Error(`Evidence retention query failed: ${evSelErr.message}`);

    if (Array.isArray(expiredFiles) && expiredFiles.length > 0) {
      const paths = expiredFiles.map((f: any) => f.storage_object_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: remErr } = await supabase.storage.from(EVIDENCE_BUCKET_NAME).remove(paths);
        if (remErr) throw new Error(`Evidence storage purge failed: ${remErr.message}`);
      }
      const ids = expiredFiles.map((f: any) => f.id);
      const { error: evUpdErr } = await supabase
        .from('order_evidence_files')
        .update({ deleted_at: nowIso })
        .in('id', ids);
      if (evUpdErr) throw new Error(`Evidence metadata soft-delete failed: ${evUpdErr.message}`);
      evidenceFilesPurged = ids.length;
    }

    // 3. Purge WhatsApp message logs past retention window (180d default)
    const cutoffIso = new Date(
      Date.now() - cfg.whatsappLogRetentionDays * 24 * 3600 * 1000
    ).toISOString();
    const { data: purgedLogs, error: waErr } = await supabase
      .from('whatsapp_message_log')
      .delete()
      .lt('created_at', cutoffIso)
      .select('id');
    if (waErr) throw new Error(`WhatsApp log purge failed: ${waErr.message}`);
    whatsappLogsPurged = Array.isArray(purgedLogs) ? purgedLogs.length : 0;

    // 4. Prune expired rate limit buckets
    const { data: prunedBuckets, error: rlErr } = await supabase
      .from('rate_limit_buckets')
      .delete()
      .lt('reset_at', nowIso)
      .select('key');
    if (rlErr) throw new Error(`Rate limit bucket prune failed: ${rlErr.message}`);
    rateLimitBucketsPruned = Array.isArray(prunedBuckets) ? prunedBuckets.length : 0;
  } catch (err: any) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Automated Retention Cleanup Job Failed (Fail Closed)',
      details: { error: err?.message || 'Unknown cleanup error' },
    }).catch(() => {});
    throw err;
  }

  logInfo('RETENTION_CLEANUP_COMPLETED', {
    expiredIpRowsScrubbed,
    evidenceFilesPurged,
    whatsappLogsPurged,
    rateLimitBucketsPruned,
  });

  return {
    timestamp: nowIso,
    expiredIpRowsScrubbed,
    evidenceFilesPurged,
    whatsappLogsPurged,
    rateLimitBucketsPruned,
  };
}
