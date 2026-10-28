import { NextRequest, NextResponse } from 'next/server';
import { createAnchorCustomer, AnchorApiError } from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty, defaults will apply
    }

    // Support both flattened input and standard Anchor { data: { attributes: { ... } } } format
    const attributes = body?.data?.attributes || body;

    const firstName = attributes?.firstName || 'Test';
    const lastName = attributes?.lastName || 'User';
    const email = attributes?.email || `testuser_${Date.now()}@example.com`;
    const phoneNumber = attributes?.phoneNumber || '+2348031234567';
    const address = attributes?.address;

    const result = await createAnchorCustomer({
      firstName,
      lastName,
      email,
      phoneNumber,
      address,
    });

    return NextResponse.json(
      {
        success: true,
        customerId: result.customerId,
        data: result.raw.data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/anchor/customers:', error);

    if (error instanceof AnchorApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errors: error.errors,
          rawResponse: error.rawResponse,
        },
        { status: error.status || 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
