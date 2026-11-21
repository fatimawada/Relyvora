import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';

const waitlistSchema = z.object({
  email: z.string().email({ message: 'A valid email address is required.' }),
  market: z.enum(['GH', 'KE', 'ZA'], { message: 'Invalid market selected.' }),
  phone_check: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const ip = getClientIp(req);

    const rl = await checkSharedRateLimit(`${ip}:waitlist`, 5, 60 * 1000, supabase);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const result = waitlistSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid form data.' },
        { status: 400 }
      );
    }

    const { email, market, phone_check } = result.data;

    if (phone_check && phone_check.trim().length > 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('market_waitlist').insert({
      email: email.toLowerCase().trim(),
      market,
      created_at: new Date().toISOString(),
    });

    if (error) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'market_waitlist Insert Failed (Fail Closed)',
        details: { error: error.message, market },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: `Failed to register waitlist interest: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Waitlist API error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
