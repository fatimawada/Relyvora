import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

const partnerInquirySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  organisation: z.string().trim().min(2, 'Organisation must be at least 2 characters'),
  email: z.string().trim().email('Please provide a valid email address'),
  partnerType: z.enum(['funder', 'corporate', 'mentor']),
  message: z.string().trim().min(10, 'Message must be at least 10 characters'),
  website: z.string().optional(), // Honeypot
});

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting: 5 submissions per 15 minutes per IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`${clientIp}:foundation_partner`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many submissions. Please wait 15 minutes before submitting again.' },
        { status: 429 }
      );
    }

    const body = await request.json();

    // 2. Honeypot Check: If hidden 'website' field is populated, silently return success without sending
    if (body.website && String(body.website).trim().length > 0) {
      console.warn(`[SPAM BLOCKED] Honeypot triggered from IP ${clientIp}`);
      return NextResponse.json({ success: true, message: 'Thank you for your inquiry.' });
    }

    // 3. Zod Validation
    const parsed = partnerInquirySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid form input';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const { name, organisation, email, partnerType, message } = parsed.data;

    // 4. Send email via Resend to foundation@relyvora.com
    const apiKey = process.env.RESEND_API_KEY;
    const recipient = 'foundation@relyvora.com';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Relyvora Foundation <alerts@relyvora.com>';

    const partnerTypeLabels: Record<string, string> = {
      funder: 'Funder / Development Finance Institution (DFI)',
      corporate: 'Corporate Sponsor / Private Sector Partner',
      mentor: 'Mentor / Ecosystem Operator',
    };

    const typeLabel = partnerTypeLabels[partnerType] || partnerType;
    const subject = `[Foundation Inquiry] New Partnership Interest: ${name} (${organisation})`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 18px; border-bottom: 2px solid #10b981; padding-bottom: 8px;">
          Relyvora Foundation Partnership Inquiry
        </h2>
        <table style="width: 100%; font-size: 14px; color: #334155; line-height: 1.6;">
          <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">Partner Category:</td><td>${typeLabel}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: bold;">Full Name:</td><td>${name}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: bold;">Organisation:</td><td>${organisation}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: bold;">Email:</td><td><a href="mailto:${email}" style="color: #059669;">${email}</a></td></tr>
          <tr><td style="padding: 6px 0; font-weight: bold;">Client IP:</td><td><code>${clientIp}</code></td></tr>
        </table>
        <h3 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-top: 20px; margin-bottom: 8px;">Message:</h3>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 13px; color: #0f172a; white-space: pre-wrap;">${message}</div>
        <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          Sent from foundation.relyvora.com partner portal
        </div>
      </div>
    `;

    if (apiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            reply_to: email,
            subject,
            html: htmlBody,
          }),
        });

        if (!resendRes.ok) {
          console.warn('Resend API error sending foundation inquiry:', await resendRes.text());
        }
      } catch (sendErr) {
        console.error('Failed to dispatch foundation email:', sendErr);
      }
    } else {
      console.log(`[FOUNDATION INQUIRY SIMULATION] To: ${recipient} | Type: ${typeLabel} | From: ${name} (${email})`);
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for reaching out. The Relyvora Foundation planning team has received your message and will be in touch.',
    });
  } catch (err: any) {
    console.error('Unhandled error in foundation partner route:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
