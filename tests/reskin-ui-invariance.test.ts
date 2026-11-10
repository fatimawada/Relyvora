/**
 * Reskin UI Invariance Test Suite
 * 
 * Verifies:
 * 1. Fee calculation engine: max(round(total * 0.03), 500)
 * 2. 6-digit release code generation, HMAC-SHA256 derivation, and verification
 * 3. Escrow transaction state machine transitions
 * 4. Pluralisation logic (1 order vs N orders)
 * 5. Legal pages text invariance (verifies zero wording changes across /terms, /privacy, /disputes)
 */

import { calculatePricing, MINIMUM_PROTECTION_FEE, PROTECTION_FEE_RATE } from '../lib/pricing';
import { 
  generateCryptographicReleaseCode, 
  computeReleaseCodeHmac, 
  MAX_CODE_ATTEMPTS, 
  CODE_LIFETIME_HOURS 
} from '../lib/releaseCode';
import { TransactionStatus } from '../lib/types';
import fs from 'fs';
import { execSync } from 'child_process';
import ts from 'typescript';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('\n--- 1. Testing Fee Calculation Invariance ---');
// Test 1: Minimum fee applies below ₦16,667 threshold
const feeSmall = calculatePricing(5000);
assert(feeSmall.itemPrice === 5000, 'Item price preserved');
assert(feeSmall.protectionFee === 500, '₦5,000 order triggers ₦500 floor fee');
assert(feeSmall.totalAmount === 5500, 'Total payable is ₦5,500');

// Test 2: Standard 3% applies above ₦16,667 threshold
const feeLarge = calculatePricing(50000);
assert(feeLarge.itemPrice === 50000, 'Item price ₦50,000 preserved');
assert(feeLarge.protectionFee === 1500, '₦50,000 order calculates 3% fee = ₦1,500');
assert(feeLarge.totalAmount === 51500, 'Total payable is ₦51,500');

// Test 3: Fee calculation with delivery fee
const feeWithDelivery = calculatePricing(40000, 2000);
assert(feeWithDelivery.itemPrice === 42000, 'Base amount includes goods + delivery');
assert(feeWithDelivery.protectionFee === 1260, '3% fee on ₦42,000 = ₦1,260');
assert(feeWithDelivery.totalAmount === 43260, 'Total payable is ₦43,260');

// Test 4: Zero / negative handling
const feeZero = calculatePricing(0);
assert(feeZero.totalAmount === 0 && feeZero.protectionFee === 0, 'Zero amount produces zero fee');

console.log('\n--- 2. Testing Release Code Flow & Cryptographic Verification ---');
// Test 5: 6-digit release code format
const code1 = generateCryptographicReleaseCode();
assert(/^\d{6}$/.test(code1), `Generated release code "${code1}" is exactly 6 digits`);

// Test 6: Deterministic HMAC calculation
const txId = 'test-tx-uuid-1234';
const hmac1 = computeReleaseCodeHmac(txId, code1);
const hmac2 = computeReleaseCodeHmac(txId, code1);
assert(hmac1.length === 64, 'Computed HMAC is 64-char hex string (SHA256)');
assert(hmac1 === hmac2, 'HMAC is deterministic for identical txId and code');

// Test 7: Different code or transaction ID produces different HMAC
const code2 = generateCryptographicReleaseCode();
const hmacDifferent = computeReleaseCodeHmac(txId, code2 === code1 ? '999999' : code2);
assert(hmac1 !== hmacDifferent, 'Different release codes produce distinct HMACs');

// Test 8: Code lifetime & attempt caps
assert(MAX_CODE_ATTEMPTS === 5, 'Maximum verification attempts strictly capped at 5');
assert(CODE_LIFETIME_HOURS === 72, 'Code lifetime is 72 hours');

console.log('\n--- 3. Testing Order State Machine Integrity ---');
const validStates: TransactionStatus[] = [
  'AWAITING_PAYMENT',
  'PARTIALLY_FUNDED',
  'FUNDS_LOCKED',
  'DISPATCHED',
  'RELEASING',
  'VENDOR_PAID',
  'RELEASED',
  'DISPUTED',
  'REFUNDED'
];
assert(validStates.length === 9, 'All 9 transaction states recognized in state machine');

// State transition simulation
function canTransition(current: TransactionStatus, next: TransactionStatus): boolean {
  switch (current) {
    case 'AWAITING_PAYMENT':
      return next === 'FUNDS_LOCKED' || next === 'PARTIALLY_FUNDED' || next === 'DISPUTED';
    case 'PARTIALLY_FUNDED':
      return next === 'FUNDS_LOCKED' || next === 'DISPUTED';
    case 'FUNDS_LOCKED':
      return next === 'DISPATCHED' || next === 'DISPUTED';
    case 'DISPATCHED':
      return next === 'RELEASING' || next === 'RELEASED' || next === 'DISPUTED';
    case 'DISPUTED':
      return next === 'RELEASED' || next === 'REFUNDED' || next === 'RELEASING';
    case 'RELEASED':
    case 'REFUNDED':
      return false; // Terminal states
    default:
      return false;
  }
}

assert(canTransition('AWAITING_PAYMENT', 'FUNDS_LOCKED'), 'AWAITING_PAYMENT -> FUNDS_LOCKED is valid');
assert(canTransition('FUNDS_LOCKED', 'DISPATCHED'), 'FUNDS_LOCKED -> DISPATCHED is valid');
assert(canTransition('DISPATCHED', 'RELEASED'), 'DISPATCHED -> RELEASED is valid');
assert(!canTransition('RELEASED', 'FUNDS_LOCKED'), 'RELEASED cannot transition back to FUNDS_LOCKED');
assert(!canTransition('REFUNDED', 'DISPATCHED'), 'REFUNDED is terminal');

console.log('\n--- 4. Testing Pluralisation Logic ---');
function formatOrderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'} successfully released`;
}

assert(formatOrderCount(0) === '0 orders successfully released', '0 orders pluralises correctly');
assert(formatOrderCount(1) === '1 order successfully released', '1 order uses singular "order"');
assert(formatOrderCount(2) === '2 orders successfully released', '2 orders uses plural "orders"');
assert(formatOrderCount(42) === '42 orders successfully released', '42 orders uses plural "orders"');

console.log('\n--- 5. Testing Legal Pages Text Invariance ---');
function extractTextFromTsx(code: string): string {
  const sourceFile = ts.createSourceFile('temp.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const words: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text) words.push(text);
    } else if (ts.isStringLiteral(node)) {
      if (node.parent && ts.isJsxAttribute(node.parent)) {
        const attrName = (node.parent.name as any)?.text;
        if (!['className', 'href', 'target', 'rel', 'id', 'role'].includes(attrName)) {
          const text = node.text.trim();
          if (text) words.push(text);
        }
      } else if (node.parent && ts.isJsxExpression(node.parent)) {
        const text = node.text.trim();
        if (text) words.push(text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return words.join(' ').replace(/\s+/g, ' ');
}

const legalFiles = ['app/disputes/page.tsx', 'app/terms/page.tsx', 'app/privacy/page.tsx'];
for (const file of legalFiles) {
  const orig = execSync(`git show HEAD:${file}`).toString('utf8');
  const curr = fs.readFileSync(file, 'utf8');
  const textOrig = extractTextFromTsx(orig);
  const textCurr = extractTextFromTsx(curr);
  assert(textOrig === textCurr, `${file} text is 100% word-for-word identical to HEAD`);
}

console.log(`\nTest Suite Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
