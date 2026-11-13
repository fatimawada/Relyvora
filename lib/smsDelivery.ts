import {
  maskWhatsappNumber,
  normalizeWhatsappPhone,
  sendOtpWhatsappTemplate,
  sendReleaseCodeWhatsappTemplate,
} from '@/lib/whatsapp';

/**
 * Out-of-Band Release Code & OTP Delivery via Meta WhatsApp Cloud API.
 *
 * Security rule: Plaintext release codes and OTPs are NEVER logged to stdout/stderr
 * and NEVER persisted in database logs or whatsapp_message_log. Only the masked
 * destination number (e.g. ******1234) and [REDACTED] markers may appear in logs.
 */

export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '******1234';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '******1234';
  return maskWhatsappNumber(phone);
}

export function normalizeNigerianPhoneE164(phone: string): string {
  return normalizeWhatsappPhone(phone) || `+${phone.replace(/\D/g, '')}`;
}

export interface SendReleaseCodeSmsOptions {
  transactionId: string;
  vendorId?: string | null;
  buyerPhone?: string | null;
  releaseCode: string;
  itemName: string;
  totalAmount: number;
  vendorHandle: string;
  preferWhatsApp?: boolean;
}

export interface SendBuyerOtpSmsOptions {
  transactionId: string;
  buyerPhone?: string | null;
  otp: string;
  purpose: 'dispute' | 'reissue_code';
}

export async function sendReleaseCodeSmsOrWhatsapp(
  options: SendReleaseCodeSmsOptions
): Promise<{ success: boolean; channel: 'whatsapp' | 'sms' | 'simulated'; maskedPhone: string; error?: string }> {
  const { transactionId, vendorId, buyerPhone, releaseCode, itemName, vendorHandle } = options;
  const maskedPhone = maskPhoneNumber(buyerPhone);

  if (!buyerPhone || !buyerPhone.trim()) {
    console.warn(`[RELEASE CODE DELIVERY] No buyer WhatsApp number on file for transaction ${transactionId}; skipped.`);
    return { success: false, channel: 'simulated', maskedPhone, error: 'No buyer phone number provided' };
  }

  const res = await sendReleaseCodeWhatsappTemplate({
    transactionId,
    vendorId,
    vendorDisplayName: vendorHandle || 'Relyvora Vendor',
    itemName: itemName || 'Escrow Order',
    releaseCode,
    buyerPhone,
  });

  if (res.success) {
    console.log(
      `[RELEASE CODE DELIVERY] Sent via WHATSAPP to ${res.maskedPhone} for transaction ${transactionId}. Code: [REDACTED]`
    );
    return {
      success: true,
      channel: process.env.WHATSAPP_ACCESS_TOKEN ? 'whatsapp' : 'simulated',
      maskedPhone: res.maskedPhone,
    };
  }

  return {
    success: false,
    channel: 'whatsapp',
    maskedPhone: res.maskedPhone,
    error: res.error || 'Failed to deliver release code via WhatsApp',
  };
}

export async function sendBuyerOtpSms(
  options: SendBuyerOtpSmsOptions
): Promise<{ success: boolean; channel: 'sms' | 'whatsapp' | 'simulated'; maskedPhone: string; error?: string }> {
  const { transactionId, buyerPhone, otp, purpose } = options;
  const maskedPhone = maskPhoneNumber(buyerPhone);

  if (!buyerPhone || !buyerPhone.trim()) {
    return { success: false, channel: 'simulated', maskedPhone, error: 'No buyer WhatsApp number on file' };
  }

  const res = await sendOtpWhatsappTemplate({
    transactionId,
    buyerPhone,
    otp,
    purpose: purpose === 'reissue_code' ? 'reissue' : 'dispute',
  });

  if (res.success) {
    console.log(
      `[OTP DELIVERY] Sent ${purpose} OTP via WHATSAPP to ${res.maskedPhone} for tx ${transactionId}. OTP: [REDACTED]`
    );
    return {
      success: true,
      channel: process.env.WHATSAPP_ACCESS_TOKEN ? 'whatsapp' : 'simulated',
      maskedPhone: res.maskedPhone,
    };
  }

  return {
    success: false,
    channel: 'whatsapp',
    maskedPhone: res.maskedPhone,
    error: res.error || 'WhatsApp OTP delivery failed',
  };
}
