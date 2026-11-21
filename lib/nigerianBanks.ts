/**
 * Shared Nigerian Bank Directory & Code-to-Name Resolver
 *
 * Used by vendor onboarding UI selectors, buyer refund bank selectors,
 * and settlement bank change WhatsApp templates (`settlement_change_confirm_v1`).
 */

export interface NigerianBankEntry {
  code: string;
  name: string;
  cbnCode?: string;
}

export const NIGERIAN_BANKS: NigerianBankEntry[] = [
  { code: '000014', name: 'Access Bank', cbnCode: '044' },
  { code: '000013', name: 'Guaranty Trust Bank (GTBank)', cbnCode: '058' },
  { code: '000015', name: 'Zenith Bank', cbnCode: '057' },
  { code: '000016', name: 'First Bank of Nigeria', cbnCode: '011' },
  { code: '000004', name: 'United Bank for Africa (UBA)', cbnCode: '033' },
  { code: '090405', name: 'Moniepoint Microfinance Bank', cbnCode: '50515' },
  { code: '090426', name: 'OPay Digital Services', cbnCode: '999992' },
  { code: '090339', name: 'PalmPay Limited', cbnCode: '999991' },
  { code: '090267', name: 'Kuda Microfinance Bank', cbnCode: '50211' },
  { code: '000023', name: 'Providus Bank', cbnCode: '101' },
  { code: '000012', name: 'Stanbic IBTC Bank', cbnCode: '221' },
  { code: '000003', name: 'First City Monument Bank (FCMB)', cbnCode: '214' },
  { code: '000001', name: 'Sterling Bank', cbnCode: '232' },
  { code: '000017', name: 'Wema Bank (ALAT)', cbnCode: '035' },
  { code: '000007', name: 'Fidelity Bank', cbnCode: '070' },
  { code: '000018', name: 'Union Bank of Nigeria', cbnCode: '032' },
];

const EXTRA_BANK_CODES: Record<string, string> = {
  '063': 'Access Bank (Diamond)',
  '000005': 'Access Bank (Diamond)',
  '050': 'Ecobank Nigeria',
  '000010': 'Ecobank Nigeria',
  '030': 'Heritage Bank',
  '000020': 'Heritage Bank',
  '082': 'Keystone Bank',
  '000002': 'Keystone Bank',
  '076': 'Polaris Bank',
  '000008': 'Polaris Bank',
  '068': 'Standard Chartered Bank',
  '000021': 'Standard Chartered Bank',
  '215': 'Unity Bank',
  '000011': 'Unity Bank',
  '301': 'Jaiz Bank',
  '000006': 'Jaiz Bank',
  '100': 'Suntrust Bank',
  '000022': 'Suntrust Bank',
  '302': 'TAJBank',
  '000026': 'TAJBank',
  '102': 'Titan Trust Bank',
  '000025': 'Titan Trust Bank',
  '103': 'Globus Bank',
  '000027': 'Globus Bank',
  '104': 'Parallex Bank',
  '000030': 'Parallex Bank',
  '105': 'PremiumTrust Bank',
  '000031': 'PremiumTrust Bank',
  '106': 'Signature Bank',
  '000034': 'Signature Bank',
  '107': 'Optimus Bank',
  '000036': 'Optimus Bank',
};

const CODE_TO_NAME_MAP = new Map<string, string>();
for (const entry of NIGERIAN_BANKS) {
  CODE_TO_NAME_MAP.set(entry.code, entry.name);
  if (entry.cbnCode) {
    CODE_TO_NAME_MAP.set(entry.cbnCode, entry.name);
  }
}
for (const [code, name] of Object.entries(EXTRA_BANK_CODES)) {
  CODE_TO_NAME_MAP.set(code, name);
}

/**
 * Resolves a Nigerian NIP/CBN bank code (e.g. "058" or "000013") into a clean
 * human-readable bank name without asterisks for Meta WhatsApp templates.
 */
export function resolveNigerianBankName(bankCodeOrName?: string | null): string {
  const cleaned = String(bankCodeOrName || '')
    .replace(/\*/g, '')
    .trim();
  if (!cleaned) return 'your verified Nigerian bank';

  const exact = CODE_TO_NAME_MAP.get(cleaned);
  if (exact) return exact;

  // Handle zero-padded NIP codes such as "000058" or trimmed short codes
  if (/^\d+$/.test(cleaned)) {
    const padded3 = cleaned.padStart(3, '0').slice(-3);
    const padded6 = cleaned.padStart(6, '0');
    const byPadded = CODE_TO_NAME_MAP.get(padded6) || CODE_TO_NAME_MAP.get(padded3);
    if (byPadded) return byPadded;
    return `Nigerian Bank (Code ${cleaned})`;
  }

  return cleaned;
}
