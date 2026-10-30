/**
 * Anchor BaaS API Client (Sandbox & Production)
 * Documentation: https://docs.getanchor.co
 * 
 * Strict Architectural Rules:
 * 1. Authentication: Uses custom header "x-anchor-key: process.env.ANCHOR_SECRET_KEY" (no Bearer token).
 * 2. Environment: Runs strictly server-side (Route Handlers, Server Actions, Server Components).
 * 3. Base URL: Default Sandbox: https://api.sandbox.getanchor.co/api/v1
 */

export const ANCHOR_SANDBOX_BASE_URL = 'https://api.sandbox.getanchor.co/api/v1';

// Known Relyvora Organization Deposit Accounts in Anchor Sandbox
export const RELYVORA_REVENUE_ACCOUNT_ID = '179319298154240-anc_acc';
export const RELYVORA_FBO_ACCOUNT_ID = '179319298212541-anc_acc';
export const RELYVORA_SETTLEMENT_ACCOUNT_ID = '179319298037338-anc_acc';
export const RELYVORA_MASTER_ACCOUNT_ID = '179319298095639-anc_acc';

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
 * Endpoint 1: Create an Individual Customer in Anchor.
 * POST /customers
 */
export async function createAnchorCustomer(
  input: CreateCustomerInput
): Promise<{ customerId: string; raw: AnchorCustomerResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

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
// 2. VENDOR TIER 1 VERIFICATION (BVN)
// ============================================================================

export interface CustomerKycInput {
  customerId: string;
  level?: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'FULL';
  bvn?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: 'MALE' | 'FEMALE' | string;
}

/**
 * Endpoint: POST /customers/{customerId}/verification/individual
 * Passes a valid dummy BVN to upgrade customer to Tier 1.
 */
export async function verifyAnchorCustomer(
  customerIdOrInput: string | CustomerKycInput,
  bvn: string = '22222222222',
  dateOfBirth: string = '1994-06-25',
  gender: 'MALE' | 'FEMALE' | string = 'MALE'
) {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const input: CustomerKycInput = typeof customerIdOrInput === 'string'
    ? { customerId: customerIdOrInput, bvn, dateOfBirth, gender, level: 'TIER_1' }
    : {
        customerId: customerIdOrInput.customerId,
        bvn: customerIdOrInput.bvn || bvn,
        dateOfBirth: customerIdOrInput.dateOfBirth || dateOfBirth,
        gender: customerIdOrInput.gender || gender,
        level: customerIdOrInput.level || 'TIER_1',
      };

  const payload = {
    data: {
      type: 'IndividualCustomerVerification',
      attributes: {
        level: input.level || 'TIER_1',
        bvn: input.bvn || '22222222222',
        dateOfBirth: input.dateOfBirth || '1994-06-25',
        gender: input.gender || 'MALE',
      },
    },
  };

  try {
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

    return { success: true, data };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to verify Anchor customer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// 3. VIRTUAL DEPOSIT ACCOUNT CREATION (PERMANENT ESCROW WALLET)
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
 * Endpoint: POST /accounts
 * Creates a permanent virtual deposit account (escrow wallet) for a verified customer.
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
// 4. BUYER CHECKOUT: DYNAMIC VIRTUAL COLLECTION ACCOUNT
// ============================================================================

export interface CreateCollectionAccountInput {
  settlementAccountId?: string;
  permanent?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VirtualNubanAttributes {
  accountNumber: string;
  accountName: string;
  bank: {
    id: string;
    name: string;
    nipCode: string;
  };
  currency: string;
  status: string;
  permanent: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export interface VirtualNubanResponse {
  data: {
    id: string;
    type: 'VirtualNuban';
    attributes: VirtualNubanAttributes;
    relationships?: Record<string, unknown>;
  };
}

/**
 * Endpoint: POST /virtual-nubans
 * Generates a dynamic Virtual Collection Account (Virtual NUBAN with Providus Bank)
 * to receive buyer checkout payments and route directly to the escrow settlement/FBO ledger.
 */
export async function createAnchorCollectionAccount(
  options: CreateCollectionAccountInput = {}
): Promise<{
  virtualNubanId: string;
  accountNumber: string;
  bankName: string;
  nipCode: string;
  accountName: string;
  raw: VirtualNubanResponse;
}> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const settlementAccountId = options.settlementAccountId || RELYVORA_SETTLEMENT_ACCOUNT_ID;

  const payload = {
    data: {
      type: 'VirtualNuban',
      attributes: {
        ...(options.metadata ? { metadata: options.metadata } : {}),
      },
      relationships: {
        settlementAccount: {
          data: {
            type: 'DepositAccount',
            id: settlementAccountId,
          },
        },
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/virtual-nubans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'Collection Account Creation Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const vn = data as VirtualNubanResponse;
    const virtualNubanId = vn.data.id;
    const accountNumber = vn.data.attributes.accountNumber;
    const bankName = vn.data.attributes.bank?.name || 'PROVIDUS BANK';
    const nipCode = vn.data.attributes.bank?.nipCode || '000023';
    const accountName = vn.data.attributes.accountName;

    return {
      virtualNubanId,
      accountNumber,
      bankName,
      nipCode,
      accountName,
      raw: vn,
    };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to create Anchor collection account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// 5. INTERNAL TRANSFERS: ESCROW RELEASE & REVENUE SPLIT
// ============================================================================

export interface BookTransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number; // In Kobo (e.g. 500000 = ₦5,000)
  reason?: string;
  reference?: string;
  currency?: string;
}

export interface AnchorTransferResponse {
  data: {
    id: string; // Ends in -anc_trsf
    type: 'BOOK_TRANSFER' | 'NIP_TRANSFER' | string;
    attributes: {
      reference: string;
      reason: string;
      amount: number;
      amountString?: string;
      status: string; // e.g. "SUCCESS", "PENDING", "FAILED"
      failureReason?: string;
      createdAt: string;
      [key: string]: unknown;
    };
    relationships?: Record<string, unknown>;
  };
}

/**
 * Executes an internal ledger BookTransfer between two Anchor deposit/escrow accounts.
 * Endpoint: POST /transfers (type: BookTransfer)
 */
export async function executeAnchorBookTransfer(
  input: BookTransferInput
): Promise<{ transferId: string; raw: AnchorTransferResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const payload = {
    data: {
      type: 'BookTransfer',
      attributes: {
        currency: input.currency || 'NGN',
        amount: Math.round(input.amount),
        reason: input.reason || 'Relyvora Escrow Settlement',
        reference: input.reference || `rv_book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      },
      relationships: {
        account: {
          data: {
            type: 'DepositAccount',
            id: input.sourceAccountId,
          },
        },
        destinationAccount: {
          data: {
            type: 'DepositAccount',
            id: input.destinationAccountId,
          },
        },
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/transfers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'Book Transfer Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const transferId = data?.data?.id;
    return { transferId, raw: data as AnchorTransferResponse };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to execute Anchor book transfer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Escrow Release & Revenue Split:
 * Routes 97% of totalAmount to vendor wallet, 3% to Relyvora revenue account.
 * 
 * @param sourceAccountId Escrow/FBO account where buyer funds are locked
 * @param vendorAccountId Vendor's permanent Anchor wallet account
 * @param relyvoraRevenueAccountId Relyvora's platform revenue account
 * @param totalAmount Total transaction amount (in Naira by default, or Kobo if isKobo: true)
 */
export async function releaseEscrowFunds(
  sourceAccountId: string,
  vendorAccountId: string,
  relyvoraRevenueAccountId: string = RELYVORA_REVENUE_ACCOUNT_ID,
  totalAmount: number,
  options: { isKobo?: boolean; referencePrefix?: string } = {}
) {
  // Convert to Kobo if amount is passed in Naira (Anchor amounts are in Kobo)
  const amountInKobo = options.isKobo ? totalAmount : Math.round(totalAmount * 100);

  // 3% platform fee, 97% vendor settlement
  const feeAmountKobo = Math.round(amountInKobo * 0.03);
  const vendorAmountKobo = amountInKobo - feeAmountKobo;

  const prefix = options.referencePrefix || `rv_escrow_${Date.now()}`;

  // 1. Transfer 97% to Vendor
  const vendorTransfer = await executeAnchorBookTransfer({
    sourceAccountId,
    destinationAccountId: vendorAccountId,
    amount: vendorAmountKobo,
    reason: `Relyvora Escrow Release (97% Vendor Payout) - Ref ${prefix}`,
    reference: `${prefix}_vendor`,
  });

  // 2. Transfer 3% to Relyvora Revenue
  const revenueTransfer = await executeAnchorBookTransfer({
    sourceAccountId,
    destinationAccountId: relyvoraRevenueAccountId,
    amount: feeAmountKobo,
    reason: `Relyvora Escrow Protection Fee (3% Platform Revenue) - Ref ${prefix}`,
    reference: `${prefix}_rev`,
  });

  return {
    totalAmountNaira: amountInKobo / 100,
    vendorAmountNaira: vendorAmountKobo / 100,
    feeAmountNaira: feeAmountKobo / 100,
    totalAmountKobo: amountInKobo,
    vendorAmountKobo,
    feeAmountKobo,
    feePercentage: 3,
    vendorTransfer,
    revenueTransfer,
  };
}

// ============================================================================
// 6. EXTERNAL BANK TRANSFER: VENDOR PAYOUT
// ============================================================================

export interface CreateCounterPartyInput {
  bankCode: string; // NIP bank code e.g. "000014" for Access Bank
  accountNumber: string;
  accountName: string;
  verifyName?: boolean;
}

export interface CounterPartyResponse {
  data: {
    id: string; // Ends in -anc_cp
    type: 'CounterParty';
    attributes: {
      accountNumber: string;
      accountName: string;
      bank: {
        id: string;
        name: string;
        nipCode: string;
      };
      status: string;
      createdAt: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Creates or registers an external Nigerian bank account counterparty.
 * Endpoint: POST /counterparties
 */
export async function createAnchorCounterParty(
  input: CreateCounterPartyInput
): Promise<{ counterPartyId: string; raw: CounterPartyResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const payload = {
    data: {
      type: 'CounterParty',
      attributes: {
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        verifyName: input.verifyName ?? false,
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/counterparties`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'CounterParty Creation Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const counterPartyId = data?.data?.id;
    return { counterPartyId, raw: data as CounterPartyResponse };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to create Anchor counterparty: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface NipTransferInput {
  sourceAccountId: string;
  counterPartyId: string;
  amount: number; // In Kobo
  reason?: string;
  reference?: string;
  currency?: string;
}

/**
 * Executes an NIPTransfer from an Anchor account to an external commercial bank in Nigeria.
 * Endpoint: POST /transfers (type: NIPTransfer)
 */
export async function executeAnchorNipTransfer(
  input: NipTransferInput
): Promise<{ transferId: string; raw: AnchorTransferResponse }> {
  const baseUrl = getAnchorBaseUrl();
  const headers = getAnchorHeaders();

  const payload = {
    data: {
      type: 'NIPTransfer',
      attributes: {
        currency: input.currency || 'NGN',
        amount: Math.round(input.amount),
        reason: input.reason || 'Relyvora Vendor Bank Payout',
        reference: input.reference || `rv_nip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      },
      relationships: {
        account: {
          data: {
            type: 'DepositAccount',
            id: input.sourceAccountId,
          },
        },
        counterParty: {
          data: {
            type: 'CounterParty',
            id: input.counterPartyId,
          },
        },
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/transfers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errors: AnchorErrorDetail[] = data.errors || [
        { title: 'NIP Transfer Failed', status: String(response.status), detail: JSON.stringify(data) },
      ];
      throw new AnchorApiError(response.status, errors, data);
    }

    const transferId = data?.data?.id;
    return { transferId, raw: data as AnchorTransferResponse };
  } catch (error) {
    if (error instanceof AnchorApiError) throw error;
    throw new Error(`Failed to execute Anchor NIP transfer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Vendor Payout (External Bank Transfer):
 * Registers external bank account counterparty and executes outward NIP transfer.
 * 
 * @param sourceAccountId Vendor's Anchor wallet account (or FBO account)
 * @param amount Payout amount (in Naira by default, or Kobo if isKobo: true)
 * @param destinationBankCode CBN/NIP Code (e.g. "000014" for Access Bank, "000013" for GTBank)
 * @param destinationAccountNumber 10-digit Nigerian NUBAN
 * @param accountName Vendor account name
 */
export async function payoutToVendorBank(
  sourceAccountId: string,
  amount: number,
  destinationBankCode: string = '000014',
  destinationAccountNumber: string = '8111111147',
  accountName: string = 'Test Vendor Payout',
  options: { isKobo?: boolean; reference?: string } = {}
) {
  const amountInKobo = options.isKobo ? amount : Math.round(amount * 100);

  // 1. Create counterparty recipient in Anchor
  const cpResult = await createAnchorCounterParty({
    bankCode: destinationBankCode,
    accountNumber: destinationAccountNumber,
    accountName,
    verifyName: false,
  });

  // 2. Initiate external NIP Transfer
  const transferResult = await executeAnchorNipTransfer({
    sourceAccountId,
    counterPartyId: cpResult.counterPartyId,
    amount: amountInKobo,
    reason: `Relyvora Cleared Funds Settlement to ${accountName}`,
    reference: options.reference || `rv_nip_${Date.now()}`,
  });

  return {
    amountNaira: amountInKobo / 100,
    amountKobo: amountInKobo,
    counterParty: cpResult.raw.data,
    transfer: transferResult.raw.data,
  };
}
