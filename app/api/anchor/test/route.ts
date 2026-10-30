import { NextRequest, NextResponse } from 'next/server';
import { 
  createAnchorCustomer, 
  createAnchorDepositAccount, 
  AnchorApiError,
  getAnchorSecretKey,
  getAnchorBaseUrl 
} from '@/lib/anchor';

export async function GET(request: NextRequest) {
  return handleTest(request);
}

export async function POST(request: NextRequest) {
  return handleTest(request);
}

async function handleTest(request: NextRequest) {
  const steps: Record<string, unknown> = {};

  try {
    // Step 0: Check environment
    const baseUrl = getAnchorBaseUrl();
    const key = getAnchorSecretKey();
    steps.configuration = {
      baseUrl,
      secretKeyConfigured: Boolean(key),
      secretKeyPrefix: key ? `${key.substring(0, 8)}...` : null,
    };

    // Step 1: Create Test Customer
    const unique = Date.now().toString().slice(-6);
    const testCustomerInput = {
      firstName: 'Test',
      lastName: 'User',
      email: `testuser_${unique}@example.com`,
      phoneNumber: `+234803${unique}1`,
    };

    steps.step1_customerCreation = {
      input: testCustomerInput,
      status: 'IN_PROGRESS',
    };

    let customerResult;
    try {
      customerResult = await createAnchorCustomer(testCustomerInput);
      steps.step1_customerCreation = {
        status: 'SUCCESS',
        customerId: customerResult.customerId,
        customerDetails: {
          type: customerResult.raw.data.type,
          fullName: customerResult.raw.data.attributes.fullName,
          email: customerResult.raw.data.attributes.email,
          phoneNumber: customerResult.raw.data.attributes.phoneNumber,
          verificationStatus: customerResult.raw.data.attributes.verification?.status,
        },
      };
    } catch (customerError) {
      if (customerError instanceof AnchorApiError) {
        steps.step1_customerCreation = {
          status: 'ANCHOR_API_ERROR',
          httpStatus: customerError.status,
          errors: customerError.errors,
          rawResponse: customerError.rawResponse,
        };
        return NextResponse.json(
          {
            success: false,
            message: 'Anchor customer creation failed. See step1_customerCreation for details.',
            steps,
          },
          { status: 200 }
        );
      }
      throw customerError;
    }

    // Step 2: Attempt Deposit Account Creation
    steps.step2_accountCreation = {
      customerId: customerResult.customerId,
      productName: 'SAVINGS',
      status: 'IN_PROGRESS',
    };

    try {
      const accountResult = await createAnchorDepositAccount({
        customerId: customerResult.customerId,
        productName: 'SAVINGS',
      });

      steps.step2_accountCreation = {
        status: 'SUCCESS',
        accountId: accountResult.accountId,
        accountDetails: accountResult.raw.data.attributes,
      };

      return NextResponse.json({
        success: true,
        message: 'Anchor integration test succeeded! Customer and Deposit Account created.',
        steps,
      });
    } catch (accountError) {
      if (accountError instanceof AnchorApiError) {
        steps.step2_accountCreation = {
          status: 'ANCHOR_API_RESPONSE',
          httpStatus: accountError.status,
          errors: accountError.errors,
          notes: 'Customer created successfully. Note that Anchor sandbox deposit accounts may require KYC verification or organization configuration depending on your Anchor tier.',
        };

        return NextResponse.json(
          {
            success: true,
            partialSuccess: true,
            customerId: customerResult.customerId,
            message: 'Customer created successfully. Account creation returned Anchor API status (see step2_accountCreation).',
            steps,
          },
          { status: 200 }
        );
      }
      throw accountError;
    }
  } catch (error) {
    console.error('Anchor test endpoint error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        steps,
      },
      { status: 500 }
    );
  }
}
