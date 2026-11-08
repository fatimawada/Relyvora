/**
 * Critical System Alerting via Resend
 * Sends notifications for webhook failures, stuck funds, dispute triggers, and reconciliation mismatches.
 */

export interface SystemAlert {
  type: 
    | 'WEBHOOK_FAILURE' 
    | 'STUCK_FUNDS' 
    | 'NEW_DISPUTE' 
    | 'SECURITY_LOCKOUT' 
    | 'PAYOUT_FAILURE' 
    | 'RECONCILIATION_MISMATCH';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  transactionId?: string;
  vendorHandle?: string;
  details: Record<string, any>;
}

export async function sendSystemAlert(alert: SystemAlert): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const alertRecipient = process.env.ALERT_EMAIL || 'support@relyvora.com';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Relyvora Alerts <alerts@relyvora.com>';

  // Format alert payload safely: strictly sanitize release codes, account numbers, and phone numbers
  const sanitizedDetails: Record<string, any> = {};
  for (const [key, value] of Object.entries(alert.details)) {
    const k = key.toLowerCase();
    if (k.includes('code') || k.includes('secret') || k.includes('hash') || k.includes('salt') || k.includes('key')) {
      continue; // Strip entirely
    }
    if (k.includes('account') && typeof value === 'string') {
      // Mask account number: e.g. ******1234
      sanitizedDetails[key] = value.length > 4 ? `******${value.slice(-4)}` : '******';
      continue;
    }
    if (k.includes('phone') && typeof value === 'string') {
      // Mask phone number: e.g. ***-***-1234
      sanitizedDetails[key] = value.length > 4 ? `***-***-${value.slice(-4)}` : '***-***-****';
      continue;
    }
    sanitizedDetails[key] = value;
  }

  const timestamp = new Date().toISOString();
  const subject = `[${alert.severity}] [Relyvora Ops] ${alert.title}`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid ${alert.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'}; padding-bottom: 12px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 18px;">${alert.title}</h2>
        <span style="background: ${alert.severity === 'CRITICAL' ? '#fee2e2' : '#fef3c7'}; color: ${alert.severity === 'CRITICAL' ? '#991b1b' : '#92400e'}; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">
          ${alert.severity}
        </span>
      </div>

      <div style="padding: 16px 0; color: #334155; font-size: 14px; line-height: 1.6;">
        <p><strong>Alert Type:</strong> <code>${alert.type}</code></p>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        ${alert.transactionId ? `<p><strong>Transaction ID:</strong> <code>${alert.transactionId}</code></p>` : ''}
        ${alert.vendorHandle ? `<p><strong>Vendor:</strong> ${alert.vendorHandle}</p>` : ''}

        <h3 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-top: 16px;">Details:</h3>
        <pre style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 12px; color: #0f172a; overflow-x: auto;">${JSON.stringify(sanitizedDetails, null, 2)}</pre>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
        Relyvora Automated Security & Operations Monitor • Phase G2
      </div>
    </div>
  `;

  if (!apiKey) {
    console.warn(`[ALERT RESEND SIMULATION] [${alert.severity}] ${alert.title}:`, sanitizedDetails);
    return { success: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [alertRecipient],
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error('Failed to send Resend alert:', errJson);
      return { success: false, error: errJson.message || 'Resend HTTP Error' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Exception sending Resend alert:', err);
    return { success: false, error: err.message };
  }
}
