/**
 * Automated Data Retention & NDPA Storage Cleanup Engine
 * Executed periodically inside `/api/cron/reconcile`.
 */

import { getServiceSupabase } from '@/lib/supabaseServer';
import { getRetentionAndStorageConfig, EVIDENCE_BUCKET_NAME } from '@/lib/evidenceStorage';
import { logInfo } from '@/lib/logger';

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

  // 1. Scrub expired hashed IP/UA/device fingerprints on transactions
  try {
    const { data: creatorExpired } = await supabase
      .from('transactions')
      .update({ creator_ip_hash: null, creator_ua_hash: null, creator_device_hash: null })
      .lt('creator_ip_expires_at', nowIso)
      .not('creator_ip_hash', 'is', null)
      .select('id');
    expiredIpRowsScrubbed += Array.isArray(creatorExpired) ? creatorExpired.length : 0;

    const { data: buyerExpired } = await supabase
      .from('transactions')
      .update({ buyer_ip_hash: null, buyer_ua_hash: null, buyer_device_hash: null })
      .lt('buyer_ip_expires_at', nowIso)
      .not('buyer_ip_hash', 'is', null)
      .select('id');
    expiredIpRowsScrubbed += Array.isArray(buyerExpired) ? buyerExpired.length : 0;
  } catch {
    // Non-fatal on pre-migration Staging
  }

  // 2. Purge evidence objects older than retention_delete_after (180d default)
  try {
    const { data: expiredFiles } = await supabase
      .from('order_evidence_files')
      .select('id, storage_bucket, storage_object_path')
      .lt('retention_delete_after', nowIso)
      .is('deleted_at', null)
      .limit(100);

    if (Array.isArray(expiredFiles) && expiredFiles.length > 0) {
      const paths = expiredFiles.map((f: any) => f.storage_object_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from(EVIDENCE_BUCKET_NAME).remove(paths).catch(() => {});
      }
      const ids = expiredFiles.map((f: any) => f.id);
      await supabase
        .from('order_evidence_files')
        .update({ deleted_at: nowIso })
        .in('id', ids);
      evidenceFilesPurged = ids.length;
    }
  } catch {
    // Non-fatal
  }

  // 3. Purge WhatsApp message logs past retention window (180d default)
  try {
    const cutoffIso = new Date(
      Date.now() - cfg.whatsappLogRetentionDays * 24 * 3600 * 1000
    ).toISOString();
    const { data: purgedLogs } = await supabase
      .from('whatsapp_message_log')
      .delete()
      .lt('created_at', cutoffIso)
      .select('id');
    whatsappLogsPurged = Array.isArray(purgedLogs) ? purgedLogs.length : 0;
  } catch {
    // Non-fatal
  }

  // 4. Prune expired rate limit buckets
  try {
    const { data: prunedBuckets } = await supabase
      .from('rate_limit_buckets')
      .delete()
      .lt('reset_at', nowIso)
      .select('key');
    rateLimitBucketsPruned = Array.isArray(prunedBuckets) ? prunedBuckets.length : 0;
  } catch {
    // Non-fatal
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
