/**
 * Admin Action Safeguards:
 * - Typed confirmation requirement for dispute resolutions / high-value overrides
 * - Mandatory audit logging to public.admin_audit_log (strict fail-closed)
 * - Real-time ops alerts via sendSystemAlert on every sensitive admin action
 */

import { getServiceSupabase } from './supabaseServer';
import { getAdminSafetyConfigServer } from './safetyLimits';
import { sendSystemAlert } from './alerts';

export function expectedAdminConfirmationPhrase(params: {
  action: 'RELEASE' | 'REFUND' | 'SPLIT' | string;
  transactionId: string;
  amountNgn: number;
}): string {
  const act = String(params.action || 'ACTION').toUpperCase().replace(/[^A-Z_]/g, '');
  const prefix = String(params.transactionId || '').slice(0, 8).toUpperCase();
  const amt = Math.round(Number(params.amountNgn) || 0);
  return `CONFIRM ${act} ${prefix} ${amt}`;
}

export async function validateAdminTypedConfirmation(params: {
  action: 'RELEASE' | 'REFUND' | 'SPLIT' | string;
  transactionId: string;
  amountNgn: number;
  typedConfirmation?: string | null;
}): Promise<{ valid: boolean; required: boolean; expectedPhrase: string; error?: string }> {
  const config = await getAdminSafetyConfigServer();
  const expectedPhrase = expectedAdminConfirmationPhrase({
    action: params.action,
    transactionId: params.transactionId,
    amountNgn: params.amountNgn,
  });

  const required =
    config.require_typed_confirmation ||
    Number(params.amountNgn || 0) >= config.high_value_confirm_threshold_ngn;

  if (!required) {
    return { valid: true, required: false, expectedPhrase };
  }

  const provided = String(params.typedConfirmation || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!provided) {
    return {
      valid: false,
      required: true,
      expectedPhrase,
      error: `Typed confirmation is required. Please enter exact phrase: "${expectedPhrase}".`,
    };
  }

  if (provided !== expectedPhrase) {
    return {
      valid: false,
      required: true,
      expectedPhrase,
      error: `Typed confirmation mismatch. Expected "${expectedPhrase}".`,
    };
  }

  return { valid: true, required: true, expectedPhrase };
}

export async function logAndAlertAdminAction(params: {
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
  alertTitle?: string;
  severity?: 'WARNING' | 'CRITICAL';
  skipAuditInsert?: boolean;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<void> {
  const now = new Date().toISOString();
  const metadata = params.metadata || {};

  if (!params.skipAuditInsert) {
    const supabase = params.supabaseClient || getServiceSupabase();
    const { error } = await supabase.from('admin_audit_log').insert({
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      metadata,
      ip_address: params.ipAddress || null,
      created_at: now,
    });
    if (error) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Admin Audit Log Persistence Failed (Fail Closed)',
        details: { action: params.action, targetType: params.targetType, error: error.message },
      }).catch(() => {});
      throw new Error(`Failed to persist mandatory admin_audit_log entry: ${error.message}`);
    }
  }

  const config = await getAdminSafetyConfigServer();
  if (config.alert_on_every_admin_action || params.severity === 'CRITICAL') {
    await sendSystemAlert({
      type: 'ADMIN_ACTION',
      severity: params.severity || 'WARNING',
      title: params.alertTitle || `Admin Action: ${params.action}`,
      transactionId: params.targetType === 'transaction' ? params.targetId : undefined,
      details: {
        adminEmail: params.adminEmail,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        ...metadata,
      },
    }).catch(() => {});
  }
}
