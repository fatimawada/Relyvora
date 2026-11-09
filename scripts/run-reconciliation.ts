/**
 * CLI / Cron Daily Reconciliation Runner
 * Phase G2.5 Requirement 3
 * 
 * Usage:
 *   npx tsx scripts/run-reconciliation.ts
 */

import { runDailyReconciliation } from '../lib/reconciliation';

async function main() {
  console.log('======================================================================');
  console.log('RELYVORA DAILY SETTLEMENT & ESCROW RECONCILIATION ENGINE');
  console.log('======================================================================\n');

  try {
    const report = await runDailyReconciliation(undefined, { sendAlerts: true });

    console.log(`Audited at: ${report.timestamp}`);
    console.log(`Total Transactions Audited: ${report.totalTransactionsAudited}`);
    console.log('\n--- STATUS BREAKDOWN ---');
    for (const [status, count] of Object.entries(report.statusCounts)) {
      console.log(`  ${status.padEnd(20)}: ${count}`);
    }

    console.log('\n--- AUDIT LEDGER TOTALS ---');
    console.log(`  Total Deposited     : ₦${report.ledgerTotals.totalDeposited.toLocaleString()}`);
    console.log(`  Total Paid to Vendor: ₦${report.ledgerTotals.totalPaidToVendors.toLocaleString()}`);
    console.log(`  Total Platform Fees : ₦${report.ledgerTotals.totalPlatformFees.toLocaleString()}`);
    console.log(`  Total Buyer Refunds : ₦${report.ledgerTotals.totalRefundedToBuyers.toLocaleString()}`);
    console.log(`  Expected FBO Balance: ₦${report.ledgerTotals.expectedEscrowBalance.toLocaleString()}`);

    if (report.anchorBalance) {
      console.log('\n--- LIVE ANCHOR FBO BALANCE ---');
      console.log(`  Actual Anchor Balance: ₦${report.anchorBalance.availableBalanceNaira.toLocaleString()}`);
      console.log(`  Variance             : ₦${report.anchorBalance.variance.toLocaleString()}`);
      console.log(`  Balanced Status      : ${report.anchorBalance.isBalanced ? '✅ BALANCED' : '❌ MISMATCH'}`);
    }

    console.log('\n--- ISSUES IDENTIFIED ---');
    if (report.issues.length === 0) {
      console.log('  ✅ Zero discrepancies found. Ledger and transactions are 100% reconciled.');
    } else {
      console.log(`  ⚠️  Found ${report.issues.length} issue(s) (${report.criticalCount} critical):`);
      for (const issue of report.issues) {
        console.log(`  [${issue.severity}] [${issue.type}] Tx: ${issue.transactionId} (${issue.status}) - ${issue.message}`);
      }
    }

    console.log('\n======================================================================');
    console.log(`RECONCILIATION RESULT: ${report.isClean ? '✅ PASS (ALL RECONCILED)' : '❌ FAIL (ACTION REQUIRED)'}`);
    console.log('======================================================================');

    if (!report.isClean && report.criticalCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal reconciliation error:', err);
    process.exit(1);
  }
}

main();
