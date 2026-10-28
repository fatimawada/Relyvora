/**
 * Anchor API Client (Sandbox & Production)
 * Documentation: https://docs.getanchor.co
 * 
 * Strict Architectural Rules:
 * 1. Authentication: Uses custom header "x-anchor-key: process.env.ANCHOR_SECRET_KEY" (no Bearer token).
 * 2. Environment: Runs strictly server-side (Route Handlers, Server Actions, Server Components).
 * 3. Base URL: Default Sandbox: https://api.sandbox.getanchor.co/api/v1
 */

export const ANCHOR_SANDBOX_BASE_URL = 'https://api.sandbox.getanchor.co/api/v1';

export interface AnchorErrorDetail {
  title?: string;
  status?: string;
  detail?: string;
  code?: string;
  source?: { pointer?: string };
}

export class AnchorApiError extends Error {
  public status: number;
  public errors: AnchorErrorDetail[];
  public rawResponse?: unknown;

  constructor(status: number, errors: AnchorErrorDetail[], rawResponse?: unknown) {
    const summary = errors.map(e => e.detail || e.title).filter(Boolean).join('; ') || `HTTP ${status}`;
    super(`Anchor API Error [${status}]: ${summary}`);
    this.name = 'AnchorApiError';
    this.status = status;
    this.errors = errors;
    this.rawResponse = rawResponse;
  }
}

/**
 * Validates and retrieves the Anchor Secret Key from the environment.
 */
export function getAnchorSecretKey(): string {
  const key = process.env.ANCHOR_SECRET_KEY;
  if (!key) {
    throw new Error(
      'ANCHOR_SECRET_KEY is not defined in environment variables. ' +
      'Please ensure it is set in your .env.local file on the server.'
    );
  }
  return key.trim();
}

/**
 * Constructs standard headers required for all Anchor API requests.
 */
export function getAnchorHeaders(): HeadersInit {
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-anchor-key': getAnchorSecretKey(),
  };
}

/**
 * Retrieves the configured Anchor API Base URL (defaults to Sandbox).
 */
export function getAnchorBaseUrl(): string {
  return process.env.ANCHOR_BASE_URL || ANCHOR_SANDBOX_BASE_URL;
}

// ============================================================================
// 1. CUSTOMER TYPES & CREATION
// ============================================================================

export interface CustomerAddress {
  addressLine_1: string;
  addressLine_2?: string;
  city: string;
  state: string;
  country: string; // e.g. "NG"
  postalCode?: string;
}

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address?: CustomerAddress;
  middleName?: string;
}

export interface AnchorCustomerAttributes {
  createdAt?: string;
  email: string;
  phoneNumber: string;
  status?: string;
  fullName?: {
    firstName: string;
    lastName: string;
    middleName?: string | null;
  };
  address?: CustomerAddress;
  verification?: {
    status: string;
  };
  [key: string]: unknown;
}

export interface AnchorCustomerResponse {
  data: {
    id: string; // Ends in -anc_cus or -anc_ind_cst
    type: string; // "IndividualCustomer"
    attributes: AnchorCustomerAttributes;
    relationships?: Record<string, unknown>;
  };
}

/**
 * Normalizes phone numbers for Nigerian BaaS platforms.
 * Converts international format "+23480..." to local "080..." if required by Anchor validator.
 */
export function normalizeNigerianPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+234') && cleaned.length === 14) {
    return '0' + cleaned.slice(4);
  }
  return cleaned;
}

/**
 * Endpoint 1: Create an Individual Customer in Anchor.
 * POST /customers
 * 
 * Automatically structures the payload to satisfy Anchor's schema requirements
 * (including fullName object and default Nigerian address if not supplied).
 */
export async function createAnchorCustomer(
  input: CreateCustomerInput
): Promise<{ customerId: string; raw: AnchorCustomerResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  // Normalize phone number (Anchor requires standard Nigerian format like 080...)
  const formattedPhone = normalizeNigerianPhone(input.phoneNumber);

  const defaultAddress: CustomerAddress = {
    addressLine_1: '12 Commercial Avenue',
    city: 'Yaba',
    state: 'Lagos',
    country: 'NG',
    postalCode: '100001',
  };

  const payload = {
    data: {
      type: 'IndividualCustomer',
      attributes: {
        // Anchor accepts both direct firstName/lastName and the fullName object
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: {
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName || null,
        },
        email: input.email,
        phoneNumber: formattedPhone,
        address: input.address || defaultAddress,
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'Customer Creation Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const customerId = data?.data?.id;
    if (!customerId) {
      throw new Error('Anchor returned success status but customer ID was missing from response.data.id');
    }

    return { customerId, raw: data as AnchorCustomerResponse };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to create Anchor customer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// 2. VIRTUAL DEPOSIT ACCOUNT TYPES & CREATION
// ============================================================================

export interface CreateAccountInput {
  customerId: string; // The ID ending in -anc_cus or -anc_ind_cst
  productName?: 'SAVINGS' | 'CURRENT' | string;
}

export interface AnchorAccountAttributes {
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  bankCode?: string;
  currency?: string;
  status?: string;
  productName?: string;
  [key: string]: unknown;
}

export interface AnchorAccountResponse {
  data: {
    id: string; // Ends in -anc_acc
    type: string; // "DepositAccount"
    attributes: AnchorAccountAttributes;
    relationships?: Record<string, unknown>;
  };
}

/**
 * Endpoint 2: Create a Virtual Deposit Account for a customer.
 * POST /accounts
 * 
 * Links the deposit account (e.g. SAVINGS product) to the customer relationship.
 */
export async function createAnchorDepositAccount(
  input: CreateAccountInput
): Promise<{ accountId: string; raw: AnchorAccountResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  if (!input.customerId) {
    throw new Error('customerId is required to create a deposit account');
  }

  const payload = {
    data: {
      type: 'DepositAccount',
      attributes: {
        productName: input.productName || 'SAVINGS',
      },
      relationships: {
        customer: {
          data: {
            type: 'IndividualCustomer',
            id: input.customerId,
          },
        },
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'Account Creation Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const accountId = data?.data?.id;
    if (!accountId) {
      throw new Error('Anchor returned success status but account ID was missing from response.data.id');
    }

    return { accountId, raw: data as AnchorAccountResponse };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to create Anchor deposit account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// 3. OPTIONAL KYC UPGRADE HELPER (SANDBOX ONLY)
// ============================================================================

export interface CustomerKycInput {
  customerId: string;
  level?: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'FULL';
  bvn: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: 'MALE' | 'FEMALE';
}

/**
 * Submits KYC verification for an Individual Customer.
 * POST /customers/{customerId}/verification/individual
 */
export async function verifyAnchorCustomer(input: CustomerKycInput) {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const payload = {
    data: {
      type: 'IndividualCustomerVerification',
      attributes: {
        level: input.level || 'TIER_1',
        bvn: input.bvn,
        dateOfBirth: input.dateOfBirth || '1994-06-25',
        gender: input.gender || 'MALE',
      },
    },
  };

  const response = await fetch(`${baseUrl}/customers/${input.customerId}/verification/individual`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errors: AnchorErrorDetail[] = data.errors || [
      { title: 'KYC Verification Failed', status: String(response.status), detail: JSON.stringify(data) },
    ];
    throw new AnchorApiError(response.status, errors, data);
  }

  return data;
}
