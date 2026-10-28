import { NextRequest, NextResponse } from 'next/server';
import { createAnchorDepositAccount, AnchorApiError } from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing JSON request body',
        },
        { status: 400 }
      );
    }

    // Support both flattened { customerId, productName } and Anchor JSON:API relationship structure
    const customerId = 
      body?.customerId || 
      body?.data?.relationships?.customer?.data?.id;

    const productName = 
      body?.productName || 
      body?.data?.attributes?.productName || 
      'SAVINGS';

    if (!customerId) {
      return NextResponse.json(
        {
          success: false,
          error: 'customerId is required. Pass either { customerId: "..." } or the Anchor relationships.customer.data.id payload.',
        },
        { status: 400 }
      );
    }

    const result = await createAnchorDepositAccount({
      customerId,
      productName,
    });

    return NextResponse.json(
      {
        success: true,
        accountId: result.accountId,
        data: result.raw.data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/anchor/accounts:', error);

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
