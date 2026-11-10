/**
 * Buyer Release Code Email Delivery (Owner Rule 3)
 * Dispatches an email receipt containing the 6-digit escrow delivery release code via Resend.
 */

import { formatNaira } from './pricing';

export interface SendReleaseCodeEmailOptions {
  buyerEmail: string;
  transactionId: string;
  itemName: string;
  totalAmount: number;
  releaseCode: string;
  vendorHandle: string;
}

export async function sendReleaseCodeReceiptEmail(
  options: SendReleaseCodeEmailOptions
): Promise<{ success: boolean; error?: string }> {
  const { buyerEmail, transactionId, itemName, totalAmount, releaseCode, vendorHandle } = options;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[SIMULATED EMAIL RECEIPT] To: ${buyerEmail} | Item: ${itemName} | Release Code: ${releaseCode}`);
    return { success: true };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Relyvora Escrow <receipts@relyvora.com>';
  const subject = `Your Relyvora Escrow Delivery Release Code: [${releaseCode}] - ${itemName}`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
        <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">RELYVORA</span>
        <span style="font-size: 12px; font-weight: 600; color: #059669; margin-left: 8px; text-transform: uppercase;">Safe Escrow Active</span>
      </div>

      <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 18px;">
        Payment Received • Your Delivery Release Code
      </h2>

      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        Your payment of <strong>${formatNaira(totalAmount)}</strong> for <strong>"${itemName}"</strong> is now locked safely in Relyvora escrow. The vendor (<strong>${vendorHandle}</strong>) has been notified to dispatch your order.
      </p>

      <!-- Prominent 6-Digit Code Box -->
      <div style="background-color: #f0fdf4; border: 2px dashed #10b981; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px;">
          Your Secret 6-Digit Release Code
        </span>
        <div style="font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #047857; margin: 8px 0;">
          ${releaseCode}
        </div>
        <p style="color: #065f46; font-size: 12px; margin: 8px 0 0 0; font-weight: 600;">
          ⚠️ NEVER SHARE THIS CODE BEFORE YOU INSPECT YOUR PACKAGE
        </p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #0f172a; text-transform: uppercase;">How Delivery Inspection Works:</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
          <li>Your vendor dispatches the item via delivery rider.</li>
          <li>When the rider arrives, inspect and test your item.</li>
          <li>If satisfied, tell the rider this 6-digit code to release payment to the vendor.</li>
          <li>If there is a defect or mismatch, withhold the code and tap <strong>Freeze Escrow</strong> on your order tracker.</li>
        </ol>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="https://ng.relyvora.com/order/${transactionId}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 10px;">
          Open Live Escrow Tracker
        </a>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
        Order Ref: ${transactionId} • Protected by Relyvora Escrow Rails<br/>
        Providus Bank / NDIC Safeguarded Custody
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [buyerEmail],
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Resend email receipt error:', errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to send release code receipt email:', err);
    return { success: false, error: err.message };
  }
}
