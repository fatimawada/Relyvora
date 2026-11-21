/**
 * Private Evidence & Proof-of-Delivery Storage Engine
 *
 * Rules:
 * - Stored strictly in private Supabase Storage bucket `relyvora-evidence` (never public).
 * - Strict MIME allowlist: image/jpeg, image/png, image/webp, video/mp4, application/pdf.
 * - Strict size limits: <= 10 MB for images/PDF, <= 25 MB for video/mp4.
 * - Random UUID object paths (never trust client filenames).
 * - Short-lived signed URLs generated server-side ONLY after authorization.
 * - Never logs raw file bytes/contents.
 * - Counterparties see file counts ONLY unless full admin review is authorized.
 */

import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getHotSettings, requireHotSetting } from '@/lib/safetyLimits';
import { logInfo } from '@/lib/logger';
import { sendSystemAlert } from '@/lib/alerts';

export const EVIDENCE_BUCKET_NAME = 'relyvora-evidence';

export const ALLOWED_EVIDENCE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

const BLOCKED_FILENAME_EXTENSIONS = [
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.com',
  '.msi',
  '.scr',
  '.vbs',
  '.html',
  '.htm',
  '.svg',
];

export type EvidenceUploaderRole = 'BUYER' | 'VENDOR' | 'ADMIN';
export type EvidenceCategory = 'DISPUTE_EVIDENCE' | 'DISPATCH_PROOF' | 'DELIVERY_HANDOVER_PROOF';

export interface StoredEvidenceRecord {
  id: string;
  transaction_id: string;
  uploaded_by_role: EvidenceUploaderRole;
  evidence_category: EvidenceCategory;
  scenario_id?: number | null;
  storage_bucket: string;
  storage_object_path: string;
  original_filename?: string | null;
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum?: string | null;
  description?: string | null;
  retention_delete_after?: string | null;
  deleted_at?: string | null;
  created_at: string;
}

export async function getRetentionAndStorageConfig(_supabaseClient?: ReturnType<typeof getServiceSupabase>) {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, unknown>>(settings, 'retention_and_storage_config');
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid system_settings.retention_and_storage_config configuration.');
  }
  return {
    evidenceRetentionDays: Math.max(30, Number(raw.evidence_retention_days)),
    ipHashRetentionDays: Math.max(7, Number(raw.ip_hash_retention_days)),
    whatsappLogRetentionDays: Math.max(30, Number(raw.whatsapp_message_log_retention_days)),
    maxImageBytes: Math.max(1024 * 1024, Number(raw.max_image_bytes)),
    maxVideoBytes: Math.max(1024 * 1024, Number(raw.max_video_bytes)),
    signedUrlTtlSeconds: Math.min(900, Math.max(60, Number(raw.signed_url_ttl_seconds))),
  };
}

function hasDangerousSignature(buf: Buffer): boolean {
  if (buf.byteLength >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return true; // PE / MZ (.exe/.dll)
  if (buf.byteLength >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true; // ELF
  if (
    buf.byteLength >= 4 &&
    ((buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && (buf[3] === 0xce || buf[3] === 0xcf)) ||
      (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe))
  ) {
    return true; // Mach-O / Java class
  }
  if (buf.byteLength >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return true; // ZIP/JAR
  if (buf.byteLength >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return true; // Shebang (#!)
  const headText = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.startsWith('<svg') ||
    headText.startsWith('<script') ||
    headText.startsWith('<?php')
  ) {
    return true;
  }
  return false;
}

function matchesExpectedMagicBytes(mime: string, buf: Buffer): boolean {
  if (mime === 'image/jpeg') {
    return buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buf.byteLength >= 8 && buf.subarray(0, 8).equals(sig);
  }
  if (mime === 'image/webp') {
    return (
      buf.byteLength >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mime === 'application/pdf') {
    return buf.byteLength >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (mime === 'video/mp4') {
    return buf.byteLength >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

export async function validateEvidenceFileInput(params: {
  mimeType: string;
  fileSizeBytes: number;
  fileBuffer?: Buffer | Uint8Array;
  originalFilename?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ valid: boolean; ext?: string; error?: string }> {
  if (params.originalFilename !== undefined && params.originalFilename !== null) {
    const rawName = String(params.originalFilename);
    if (
      rawName.includes('\0') ||
      rawName.includes('..') ||
      rawName.includes('/') ||
      rawName.includes('\\')
    ) {
      return {
        valid: false,
        error: 'Invalid filename: path segments or traversal sequences are not permitted.',
      };
    }
    const lowerName = rawName.trim().toLowerCase();
    for (const blockedExt of BLOCKED_FILENAME_EXTENSIONS) {
      if (lowerName.endsWith(blockedExt)) {
        return {
          valid: false,
          error: `Unsupported or executable filename extension '${blockedExt}'.`,
        };
      }
    }
  }

  const mime = String(params.mimeType || '').trim().toLowerCase();
  const ext = ALLOWED_EVIDENCE_MIME_EXT[mime];
  if (!ext) {
    return {
      valid: false,
      error: `Unsupported file type '${mime || 'unknown'}'. Allowed: jpeg, png, webp, mp4, pdf.`,
    };
  }

  const size = Number(params.fileSizeBytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: 'Evidence file cannot be empty.' };
  }

  const cfg = await getRetentionAndStorageConfig(params.supabaseClient);
  const limit = mime === 'video/mp4' ? cfg.maxVideoBytes : cfg.maxImageBytes;
  if (size > limit) {
    return {
      valid: false,
      error: `File size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed (${(limit / (1024 * 1024)).toFixed(0)} MB) for ${mime}.`,
    };
  }

  if (params.fileBuffer) {
    const buf = Buffer.isBuffer(params.fileBuffer) ? params.fileBuffer : Buffer.from(params.fileBuffer);
    if (hasDangerousSignature(buf)) {
      return {
        valid: false,
        error: 'Executable or script payload detected in file header. Upload rejected.',
      };
    }
    if (!matchesExpectedMagicBytes(mime, buf)) {
      return {
        valid: false,
        error: `File signature does not match declared MIME type '${mime}'.`,
      };
    }
  }

  return { valid: true, ext };
}

function pathSafeBasename(name: string): string {
  const parts = String(name).split(/[/\\]/);
  return (parts[parts.length - 1] || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadOrderEvidenceFile(params: {
  transactionId: string;
  uploadedByRole: EvidenceUploaderRole;
  evidenceCategory: EvidenceCategory;
  scenarioId?: number | null;
  fileBuffer: Buffer | Uint8Array;
  mimeType: string;
  originalFilename?: string | null;
  description?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; record?: StoredEvidenceRecord; error?: string }> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const buf = Buffer.isBuffer(params.fileBuffer) ? params.fileBuffer : Buffer.from(params.fileBuffer);

  const check = await validateEvidenceFileInput({
    mimeType: params.mimeType,
    fileSizeBytes: buf.byteLength,
    fileBuffer: buf,
    originalFilename: params.originalFilename,
    supabaseClient: supabase,
  });
  if (!check.valid || !check.ext) {
    return { success: false, error: check.error || 'Invalid evidence file.' };
  }

  const cfg = await getRetentionAndStorageConfig(supabase);
  const objectId = crypto.randomUUID();
  const objectPath = `${params.transactionId}/${params.evidenceCategory.toLowerCase()}/${objectId}.${check.ext}`;
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const retentionDeleteAfter = new Date(
    Date.now() + cfg.evidenceRetentionDays * 24 * 3600 * 1000
  ).toISOString();
  const safeOrigName = params.originalFilename
    ? pathSafeBasename(params.originalFilename).slice(0, 120)
    : `evidence.${check.ext}`;

  const { error: upErr } = await supabase.storage
    .from(EVIDENCE_BUCKET_NAME)
    .upload(objectPath, buf, {
      contentType: params.mimeType.toLowerCase(),
      upsert: false,
    });

  if (upErr) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Private Evidence Storage Upload Failed (Fail Closed)',
      transactionId: params.transactionId,
      details: { bucket: EVIDENCE_BUCKET_NAME, error: upErr.message },
    }).catch(() => {});
    return {
      success: false,
      error: `Private evidence storage upload failed: ${upErr.message}`,
    };
  }

  const record: StoredEvidenceRecord = {
    id: objectId,
    transaction_id: params.transactionId,
    uploaded_by_role: params.uploadedByRole,
    evidence_category: params.evidenceCategory,
    scenario_id: params.scenarioId ?? null,
    storage_bucket: EVIDENCE_BUCKET_NAME,
    storage_object_path: objectPath,
    original_filename: safeOrigName,
    mime_type: params.mimeType.toLowerCase(),
    file_size_bytes: buf.byteLength,
    sha256_checksum: sha256,
    description: params.description ? String(params.description).slice(0, 500) : null,
    retention_delete_after: retentionDeleteAfter,
    deleted_at: null,
    created_at: new Date().toISOString(),
  };

  const { data, error: metaErr } = await supabase
    .from('order_evidence_files')
    .insert(record)
    .select('*')
    .single();

  if (metaErr || !data) {
    await supabase.storage.from(EVIDENCE_BUCKET_NAME).remove([objectPath]).catch(() => {});
    const errMsg = metaErr?.message || 'Unknown error inserting order_evidence_files row';
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Evidence Metadata Insert Failed (Fail Closed)',
      transactionId: params.transactionId,
      details: { error: errMsg },
    }).catch(() => {});
    return { success: false, error: `Failed saving evidence metadata: ${errMsg}` };
  }

  logInfo('EVIDENCE_UPLOADED', {
    transactionId: params.transactionId,
    fileId: data.id,
    category: params.evidenceCategory,
    role: params.uploadedByRole,
    bytes: buf.byteLength,
  });
  return { success: true, record: data as StoredEvidenceRecord };
}

export async function listOrderEvidenceRecords(
  transactionId: string,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<StoredEvidenceRecord[]> {
  const supabase = supabaseClient || getServiceSupabase();
  const { data, error } = await supabase
    .from('order_evidence_files')
    .select('*')
    .eq('transaction_id', transactionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Evidence Records Query Failed (Fail Closed)',
      transactionId,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Failed querying order_evidence_files: ${error.message}`);
  }

  return (data || []) as StoredEvidenceRecord[];
}

export async function getAuthorizedEvidenceSummary(params: {
  transactionId: string;
  viewerRole: 'BUYER' | 'VENDOR' | 'ADMIN';
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}) {
  const all = await listOrderEvidenceRecords(params.transactionId, params.supabaseClient);

  if (params.viewerRole === 'ADMIN') {
    return {
      files: all,
      countsByRole: {
        BUYER: all.filter((f) => f.uploaded_by_role === 'BUYER').length,
        VENDOR: all.filter((f) => f.uploaded_by_role === 'VENDOR').length,
        ADMIN: all.filter((f) => f.uploaded_by_role === 'ADMIN').length,
      },
      countsByCategory: {
        DISPATCH_PROOF: all.filter((f) => f.evidence_category === 'DISPATCH_PROOF').length,
        DELIVERY_HANDOVER_PROOF: all.filter((f) => f.evidence_category === 'DELIVERY_HANDOVER_PROOF').length,
        DISPUTE_EVIDENCE: all.filter((f) => f.evidence_category === 'DISPUTE_EVIDENCE').length,
      },
    };
  }

  const ownFiles = all.filter((f) => f.uploaded_by_role === params.viewerRole);
  const counterpartyRole = params.viewerRole === 'BUYER' ? 'VENDOR' : 'BUYER';
  const counterpartyDisputeCount = all.filter(
    (f) => f.uploaded_by_role === counterpartyRole && f.evidence_category === 'DISPUTE_EVIDENCE'
  ).length;
  const dispatchProofCount = all.filter((f) => f.evidence_category === 'DISPATCH_PROOF').length;
  const handoverProofCount = all.filter((f) => f.evidence_category === 'DELIVERY_HANDOVER_PROOF').length;

  return {
    ownFiles,
    counterpartyDisputeEvidenceCount: counterpartyDisputeCount,
    dispatchProofCount,
    handoverProofCount,
  };
}

export async function createEvidenceSignedUrl(params: {
  fileId: string;
  transactionId: string;
  viewerRole: 'BUYER' | 'VENDOR' | 'ADMIN';
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; signedUrl?: string; expiresInSeconds?: number; error?: string; statusCode?: number }> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const files = await listOrderEvidenceRecords(params.transactionId, supabase);
  const target = files.find((f) => f.id === params.fileId);

  if (!target) {
    return { success: false, error: 'Evidence file not found.', statusCode: 404 };
  }

  if (params.viewerRole !== 'ADMIN' && target.uploaded_by_role !== params.viewerRole) {
    return {
      success: false,
      error: 'Forbidden: Counterparty evidence files are accessible only to Trust & Safety admins.',
      statusCode: 403,
    };
  }

  const cfg = await getRetentionAndStorageConfig(supabase);
  const { data, error } = await supabase.storage
    .from(target.storage_bucket || EVIDENCE_BUCKET_NAME)
    .createSignedUrl(target.storage_object_path, cfg.signedUrlTtlSeconds);

  if (error || !data?.signedUrl) {
    const errMsg = error?.message || 'Storage createSignedUrl returned no URL';
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Evidence Signed URL Generation Failed (Fail Closed)',
      transactionId: params.transactionId,
      details: { fileId: target.id, error: errMsg },
    }).catch(() => {});
    return {
      success: false,
      statusCode: 500,
      error: `Failed to generate signed URL: ${errMsg}`,
    };
  }

  return {
    success: true,
    signedUrl: data.signedUrl,
    expiresInSeconds: cfg.signedUrlTtlSeconds,
  };
}
