import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../app/(corporate)/page';
import HowItWorksPage from '../app/(corporate)/how-it-works/page';
import TrustAndSafetyPage from '../app/(corporate)/trust-and-safety/page';
import { HeroPaymentLoop } from '../components/hero/HeroPaymentLoop';
import {
  HOW_IT_WORKS_TABS,
  HowItWorksSwitcher,
  SAMPLE_ITEM_NAME,
  SAMPLE_ITEM_PRICE_NGN,
  SAMPLE_ORDER_LABEL,
  SAMPLE_STORE_NAME,
} from '../components/how-it-works/HowItWorksSwitcher';
import {
  HANDOVER_ALT_TEXT,
  HandoverIllustration,
} from '../components/common/HandoverIllustration';
import { FEE_CONFIG, calculateFee } from '../lib/feeConfig';

const ROOT = process.cwd();

function stripHtmlTagsToInnerText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function runSuite() {
  console.log('======================================================================');
  console.log('CORPORATE HERO LOOP, HANDOVER ILLUSTRATION & HOW IT WORKS SWITCHER SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  const pass = (msg: string) => {
    passed += 1;
    console.log(`[PASS] ${msg}`);
  };

  // -------------------------------------------------------------------------
  // 1. NO SIX-DIGIT NUMBER PATTERN (\b\d{6}\b) IN VISIBLE RENDERED TEXT
  // -------------------------------------------------------------------------
  console.log('--- 1. VISIBLE RENDERED TEXT (innerText) SIX-DIGIT AUDIT ---');
  const homeHtml = renderToStaticMarkup(React.createElement(HomePage));
  const howItWorksHtml = renderToStaticMarkup(React.createElement(HowItWorksPage));
  const trustHtml = renderToStaticMarkup(React.createElement(TrustAndSafetyPage));

  const homeInnerText = stripHtmlTagsToInnerText(homeHtml);
  const howItWorksInnerText = stripHtmlTagsToInnerText(howItWorksHtml);
  const trustInnerText = stripHtmlTagsToInnerText(trustHtml);

  const sixDigitRegex = /\b\d{6}\b/g;
  const spacedSixDigitRegex = /\b\d{3}\s+\d{3}\b/g;

  assert.equal(
    sixDigitRegex.test(homeInnerText),
    false,
    `Home page visible text must not contain a 6-digit number: matched ${homeInnerText.match(sixDigitRegex)}`
  );
  assert.equal(
    spacedSixDigitRegex.test(homeInnerText),
    false,
    `Home page visible text must not contain a spaced 6-digit code like 842 195`
  );
  assert.equal(
    sixDigitRegex.test(howItWorksInnerText),
    false,
    `/how-it-works visible text must not contain a 6-digit number: matched ${howItWorksInnerText.match(sixDigitRegex)}`
  );
  assert.equal(
    spacedSixDigitRegex.test(howItWorksInnerText),
    false,
    `/how-it-works visible text must not contain a spaced 6-digit code`
  );
  assert.equal(
    sixDigitRegex.test(trustInnerText),
    false,
    `/trust-and-safety visible text must not contain a 6-digit number: matched ${trustInnerText.match(sixDigitRegex)}`
  );

  // Specifically verify the home "Safe for buyers" section
  const safeForBuyersMatch = homeHtml.match(
    /data-testid="home-safe-for-buyers"[\s\S]*?<\/div>\s*<\/div>/
  );
  assert.ok(safeForBuyersMatch, 'Home page must contain data-testid="home-safe-for-buyers"');
  const safeForBuyersText = stripHtmlTagsToInnerText(safeForBuyersMatch[0]);
  assert.equal(
    sixDigitRegex.test(safeForBuyersText),
    false,
    'Home "Safe for buyers" section must not contain a 6-digit number'
  );
  assert.equal(
    homeHtml.includes('842 195') || howItWorksHtml.includes('842 195') || trustHtml.includes('842 195'),
    false,
    'Visible six-digit code "842 195" must be completely removed'
  );
  pass(
    'Zero 6-digit number patterns (\\b\\d{6}\\b) or "842 195" appear in rendered text of /, /how-it-works, /trust-and-safety, or "Safe for buyers"'
  );

  // -------------------------------------------------------------------------
  // 2. HERO CONTAINS NO <canvas>, WebGL, OR 3D ASSET; MARKETING BUNDLE DOES NOT IMPORT THREE.JS
  // -------------------------------------------------------------------------
  console.log('\n--- 2. HERO 3D REMOVAL & MARKETING BUNDLE THREE.JS ISOLATION ---');
  const heroHtml = renderToStaticMarkup(React.createElement(HeroPaymentLoop));
  assert.equal(
    /<canvas/i.test(heroHtml) || /<canvas/i.test(homeHtml),
    false,
    'Hero and Home page must not contain any <canvas> element'
  );
  assert.equal(
    /step-1-light\.webp|EscrowObjects3D|Step 1/i.test(heroHtml),
    false,
    'Hero must not reference floating 3D navy box posters or Step 1 caption'
  );

  // Verify no file in app/(corporate) or any component imported by app/(corporate) imports three or EscrowObjects3D
  const corporateDir = path.join(ROOT, 'app', '(corporate)');
  const collectFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectFiles(full));
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const corporateFiles = collectFiles(corporateDir);
  for (const file of corporateFiles) {
    const src = fs.readFileSync(file, 'utf8');
    assert.equal(
      /HeroStage|EscrowObjects3D|from ['"]three['"]|@react-three/.test(src),
      false,
      `Corporate marketing file ${path.relative(ROOT, file)} must not import HeroStage, EscrowObjects3D, or three.js`
    );
  }

  // Also confirm EscrowObjects3D.tsx still exists in the codebase for the payment screen
  assert.equal(
    fs.existsSync(path.join(ROOT, 'components', 'hero', 'EscrowObjects3D.tsx')),
    true,
    'EscrowObjects3D.tsx 3D asset must remain in codebase for payment screen use'
  );
  pass(
    'Hero contains no <canvas>, WebGL, or 3D asset; corporate marketing pages do not import three.js while 3D asset stays in codebase'
  );

  // -------------------------------------------------------------------------
  // 3. HERO LOOP TIMING (14s), PILLS, AND REDUCED MOTION
  // -------------------------------------------------------------------------
  console.log('\n--- 3. HERO LOOP STRUCTURE (14s) & PREFERS-REDUCED-MOTION ---');
  assert.ok(heroHtml.includes('Payment held'), 'Hero loop must include "Payment held" status pill');
  assert.ok(
    heroHtml.includes('Released to seller'),
    'Hero loop must include "Released to seller" status pill'
  );
  assert.ok(
    heroHtml.includes('Your money waits until delivery is confirmed.'),
    'Hero loop must include reduced-motion caption "Your money waits until delivery is confirmed."'
  );

  const globalsCss = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  assert.ok(
    globalsCss.includes('animation: hero-scene-a-loop 14s infinite') &&
      globalsCss.includes('animation: hero-scene-b-loop 14s infinite') &&
      globalsCss.includes('animation: hero-scene-c-loop 14s infinite'),
    'Hero loop CSS must run on a 14s cycle across Scenes A, B, and C'
  );
  assert.ok(
    globalsCss.includes('@media (prefers-reduced-motion: reduce)') &&
      globalsCss.includes('animation: none !important;') &&
      /\.hero-reduced-motion-caption\s*\{\s*display:\s*block\s*!important;\s*\}/.test(globalsCss),
    'prefers-reduced-motion CSS must disable animation and show the static caption'
  );
  pass(
    'Hero loop runs 14s CSS transform/opacity cycle ("Payment held" -> "Released to seller") and freezes on Scene A with static caption under prefers-reduced-motion'
  );

  // -------------------------------------------------------------------------
  // 4. HOW IT WORKS SWITCHER: TABS, KEYBOARD NAVIGATION, PANELS & SAMPLE DATA
  // -------------------------------------------------------------------------
  console.log('\n--- 4. HOW IT WORKS SWITCHER TABS, A11Y, SAMPLE DATA & FEE_CONFIG ---');
  const switcherHtml = renderToStaticMarkup(React.createElement(HowItWorksSwitcher));

  assert.equal(HOW_IT_WORKS_TABS.length, 4, 'Switcher must have exactly 4 tabs');
  assert.deepEqual(
    HOW_IT_WORKS_TABS.map((t) => t.tabLabel),
    [
      '1. Link created',
      '2. Money held',
      '3. Order dispatched',
      '4. Code confirmed and paid',
    ],
    'Switcher tab labels must match exact specification'
  );

  // Check ARIA roles and attributes in rendered markup
  assert.ok(switcherHtml.includes('role="tablist"'), 'Switcher must render role="tablist"');
  const tabRoleCount = (switcherHtml.match(/role="tab"/g) || []).length;
  const panelRoleCount = (switcherHtml.match(/role="tabpanel"/g) || []).length;
  assert.equal(tabRoleCount, 4, 'Switcher must render 4 role="tab" buttons');
  assert.equal(panelRoleCount, 4, 'Switcher must render 4 role="tabpanel" panels');
  assert.ok(
    switcherHtml.includes('aria-selected="true"') && switcherHtml.includes('aria-selected="false"'),
    'Switcher tabs must render aria-selected state'
  );
  assert.ok(switcherHtml.includes('aria-controls='), 'Switcher tabs must include aria-controls');

  // Verify keyboard arrow handler exists in component source
  const switcherSrc = fs.readFileSync(
    path.join(ROOT, 'components', 'how-it-works', 'HowItWorksSwitcher.tsx'),
    'utf8'
  );
  assert.ok(
    switcherSrc.includes("e.key === 'ArrowRight'") &&
      switcherSrc.includes("e.key === 'ArrowLeft'") &&
      switcherSrc.includes('setSelectedIndex(nextIndex)'),
    'HowItWorksSwitcher must implement ArrowRight / ArrowLeft keyboard tab navigation'
  );

  // Verify all 4 panel statuses and content exist in markup
  assert.ok(
    switcherHtml.includes(
      'Hello. @gadgetstore has created a payment link on Relyvora for Wireless Headphone (₦45,000). Your payment is securely held until your order is delivered. Tap Continue to open your payment page.'
    ),
    'Tab 1 must show approved payment_link_v1 wording with @gadgetstore, Wireless Headphone, and ₦45,000'
  );
  assert.ok(
    switcherHtml.includes('WhatsApp message') &&
      switcherHtml.includes('Continue') &&
      switcherHtml.includes('Not my order'),
    'Tab 1 must show "WhatsApp message", "Continue" and "Not my order" buttons'
  );
  assert.ok(
    switcherHtml.includes('Money held with our banking partner'),
    'Tab 2 must show status pill "Money held with our banking partner"'
  );
  assert.ok(
    switcherHtml.includes('Order dispatched') &&
      switcherHtml.includes('Inspect before handing over your code'),
    'Tab 3 must show "Order dispatched" and "Inspect before handing over your code"'
  );
  assert.ok(
    switcherHtml.includes('Code given to rider. Seller paid.') &&
      switcherHtml.includes('Code shown to buyer only'),
    'Tab 4 must show "Code given to rider. Seller paid." and "Code shown to buyer only"'
  );

  const emptyBoxCount = (switcherHtml.match(/data-testid="empty-code-box-/g) || []).length;
  assert.equal(emptyBoxCount, 6, 'Tab 4 must render 6 empty code boxes with zero digits');

  // Verify sample data rules
  assert.equal(SAMPLE_STORE_NAME, '@gadgetstore');
  assert.equal(SAMPLE_ITEM_NAME, 'Wireless Headphone');
  assert.equal(SAMPLE_ORDER_LABEL, 'Order');
  pass(
    'HowItWorksSwitcher renders 4 accessible tabs + 4 tabpanels with arrow-key navigation, sample data ("@gadgetstore", "Wireless Headphone", "Order", "WhatsApp message"), and 6 empty code boxes'
  );

  // -------------------------------------------------------------------------
  // 5. PAYMENT AMOUNTS MATCH FEE_CONFIG (45,000 / 1,350 / 46,350)
  // -------------------------------------------------------------------------
  console.log('\n--- 5. DYNAMIC FEE_CONFIG AMOUNTS VERIFICATION ---');
  const computed = calculateFee(SAMPLE_ITEM_PRICE_NGN, 0);
  assert.equal(FEE_CONFIG.RATE, 0.03, 'FEE_CONFIG.RATE must be 0.03 (3%)');
  assert.equal(computed.itemPrice, 45000);
  assert.equal(computed.feeAmount, 1350);
  assert.equal(computed.totalAmount, 46350);
  assert.equal(computed.formattedItemPrice, '₦45,000');
  assert.equal(computed.formattedFeeAmount, '₦1,350');
  assert.equal(computed.formattedTotalAmount, '₦46,350');
  assert.ok(
    switcherHtml.includes('₦45,000') &&
      switcherHtml.includes('₦1,350') &&
      switcherHtml.includes('₦46,350'),
    'Phone screens must render dynamic FEE_CONFIG amounts: ₦45,000 / ₦1,350 / ₦46,350'
  );
  pass('Payment amounts on the phone dynamically match FEE_CONFIG: ₦45,000 / ₦1,350 (3%) / ₦46,350');

  // -------------------------------------------------------------------------
  // 6. IMAGE ALT TEXT PRESENT & DECORATIVE SVGs HAVE aria-hidden="true"
  // -------------------------------------------------------------------------
  console.log('\n--- 6. HANDOVER ILLUSTRATION PLACEMENT, ALT TEXT & SVG A11Y ---');
  const handoverHtml = renderToStaticMarkup(React.createElement(HandoverIllustration));
  assert.equal(
    HANDOVER_ALT_TEXT,
    'A buyer checks a parcel at the door before confirming delivery.'
  );
  assert.ok(
    handoverHtml.includes(`alt="${HANDOVER_ALT_TEXT}"`),
    'HandoverIllustration must include the exact required alt text'
  );

  // Verify HandoverIllustration is placed in:
  // 1) Home page "Safe for buyers" card (and NOT in the hero)
  // 2) /how-it-works above the step list
  // 3) /trust-and-safety top section beside the heading
  assert.ok(
    safeForBuyersMatch[0].includes(HANDOVER_ALT_TEXT),
    'Home page "Safe for buyers" card must contain the HandoverIllustration'
  );
  assert.equal(
    heroHtml.includes(HANDOVER_ALT_TEXT),
    false,
    'Hero must NOT contain the HandoverIllustration'
  );
  assert.ok(
    howItWorksHtml.includes(HANDOVER_ALT_TEXT),
    '/how-it-works must contain the HandoverIllustration'
  );
  assert.ok(
    trustHtml.includes(HANDOVER_ALT_TEXT),
    '/trust-and-safety must contain the HandoverIllustration'
  );

  // Verify all decorative inline <svg> elements in HeroPaymentLoop, HomePage, HowItWorksPage, and TrustAndSafetyPage have aria-hidden="true"
  for (const [pageName, html] of [
    ['HeroPaymentLoop', heroHtml],
    ['HomePage (/)', homeHtml],
    ['HowItWorksPage (/how-it-works)', howItWorksHtml],
    ['TrustAndSafetyPage (/trust-and-safety)', trustHtml],
  ] as const) {
    const svgTags = html.match(/<svg[^>]*>/g) || [];
    for (const tag of svgTags) {
      assert.ok(
        tag.includes('aria-hidden="true"'),
        `Every decorative inline <svg> on ${pageName} must have aria-hidden="true". Found: ${tag}`
      );
    }
  }
  pass(
    'Handover illustration renders in all 3 required locations (and not in hero) with exact alt text; all decorative inline SVGs have aria-hidden="true"'
  );

  // -------------------------------------------------------------------------
  // 7. ASSET WEIGHT BUDGETS (< 60 KB HERO SCENE, < 80 KB HANDOVER IMAGE)
  // -------------------------------------------------------------------------
  console.log('\n--- 7. HERO SCENE (<60 KB) & HANDOVER IMAGE (<80 KB) WEIGHT MEASUREMENT ---');
  const heroComponentBytes = Buffer.byteLength(
    fs.readFileSync(path.join(ROOT, 'components', 'hero', 'HeroPaymentLoop.tsx'), 'utf8'),
    'utf8'
  );
  const heroRenderedHtmlBytes = Buffer.byteLength(heroHtml, 'utf8');
  const handoverSvgBytes = fs.statSync(
    path.join(ROOT, 'public', 'illustrations', 'handover-doorway.svg')
  ).size;
  const handoverWebpBytes = fs.statSync(
    path.join(ROOT, 'public', 'illustrations', 'handover-doorway.webp')
  ).size;

  console.log(
    `   HeroPaymentLoop source: ${(heroComponentBytes / 1024).toFixed(2)} KB | rendered SVG HTML: ${(
      heroRenderedHtmlBytes / 1024
    ).toFixed(2)} KB (limit: 60.00 KB)`
  );
  console.log(
    `   handover-doorway.svg: ${(handoverSvgBytes / 1024).toFixed(2)} KB | handover-doorway.webp: ${(
      handoverWebpBytes / 1024
    ).toFixed(2)} KB (limit: 80.00 KB)`
  );

  assert.ok(
    heroComponentBytes < 60 * 1024 && heroRenderedHtmlBytes < 60 * 1024,
    `Hero scene weight must be under 60 KB (got ${heroComponentBytes} bytes)`
  );
  assert.ok(
    handoverSvgBytes < 80 * 1024 && handoverWebpBytes < 80 * 1024,
    `Handover illustration SVG and WebP must each be under 80 KB (got SVG=${handoverSvgBytes}, WebP=${handoverWebpBytes})`
  );

  // Also check docs/OWNER-INPUT.md exists and documents the 3 open decisions
  const ownerInputPath = path.join(ROOT, 'docs', 'OWNER-INPUT.md');
  assert.equal(fs.existsSync(ownerInputPath), true, 'docs/OWNER-INPUT.md must exist');
  const ownerInputText = fs.readFileSync(ownerInputPath, 'utf8');
  assert.ok(
    ownerInputText.includes('@gadgetstore') &&
      ownerInputText.includes('Illustrator') &&
      ownerInputText.includes('Notify'),
    'docs/OWNER-INPUT.md must list all three open decisions'
  );
  pass(
    `Hero scene weight (${(heroRenderedHtmlBytes / 1024).toFixed(2)} KB < 60 KB), Handover SVG (${(
      handoverSvgBytes / 1024
    ).toFixed(2)} KB < 80 KB), Handover WebP (${(handoverWebpBytes / 1024).toFixed(
      2
    )} KB < 80 KB), and docs/OWNER-INPUT.md verified`
  );

  console.log('\n======================================================================');
  console.log(`CORPORATE MARKETING SUITE SUMMARY: ${passed}/7 CHECKS PASSED`);
  console.log('======================================================================');
}

runSuite().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
