import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the Service Role Key to bypass RLS securely on the server
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, storeName, firstName, lastName, email, phone } = body;

    // STEP 1: Create the Tier 0 Customer Profile on Anchor
    const anchorResponse = await fetch('https://api.getanchor.co/api/v1/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-anchor-key': process.env.ANCHOR_SECRET_KEY!, // Your sandbox/live key
      },
      body: JSON.stringify({
        customerType: 'INDIVIDUAL',
        fullName: `${firstName} ${lastName}`,
        email: email,
        phoneNumber: phone,
      }),
    });

    const anchorData = await anchorResponse.json();

    if (!anchorResponse.ok) {
      console.error('Anchor API Error:', anchorData);
      return NextResponse.json(
        { error: 'Failed to create banking profile with Anchor.' }, 
        { status: 400 }
      );
    }

    // Anchor successfully generated a unique Customer ID
    const anchorCustomerId = anchorData.data.id; 

    // STEP 2: Save the Vendor to your Supabase Database
    const { data: vendorData, error: dbError } = await supabase
      .from('vendors')
      .insert({
        user_id: userId,
        store_name: storeName,
        legal_first_name: firstName,
        legal_last_name: lastName,
        email: email,
        phone_number: phone,
        anchor_customer_id: anchorCustomerId, // CRITICAL: Link Relyvora to Anchor
        kyc_status: 'pending'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // STEP 3: Return success to the frontend to trigger the BVN/NIN step
    return NextResponse.json({ success: true, vendor: vendorData });

  } catch (error: any) {
    console.error('Onboarding Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
