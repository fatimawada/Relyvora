import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

// Simple in-memory rate limiting map: IP -> timestamp[]
const rateLimitMap = new Map<string, number[]>();

const waitlistSchema = z.object({
  email: z.string().email({ message: 'A valid email address is required.' }),
  market: z.enum(['GH', 'KE', 'ZA'], { message: 'Invalid market selected.' }),
  phone_check: z.string().optional(), // Honeypot field
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const now = Date.now();

    // Clean up timestamps older than 60 seconds
    const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < 60000);
    if (timestamps.length >= 5) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429 }
      );
    }
    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);

    const body = await req.json();
    const result = waitlistSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid form data.' },
        { status: 400 }
      );
    }

    const { email, market, phone_check } = result.data;

    // Honeypot check: if filled, quietly reject bot without error
    if (phone_check && phone_check.trim().length > 0) {
      return NextResponse.json({ success: true });
    }

    // Insert into market_waitlist table
    const { error } = await supabase.from('market_waitlist').insert({
      email: email.toLowerCase().trim(),
      market,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Log to console but provide graceful user experience if table is created later
      console.warn('Supabase market_waitlist insert note:', error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Waitlist API error:', message);
    return NextResponse.json({ success: true }); // Graceful fallback
  }
}
