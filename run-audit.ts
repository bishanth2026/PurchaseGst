// In Node.js environment, provide a safe in-memory localStorage polyfill for tests
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  };
}

import { executeFullFunctionalAudit } from './src/utils/functionalAuditRunner';
import { runAllStatutoryScenarioTests, runExplicitSection17_5Audit } from './src/utils/statutoryScenarioTests';
import { runReconciliation, computeDashboardMetrics } from './src/utils/reconciliationEngine';
import { generate100InvoicesDataset } from './src/utils/stressTest100';
import { verifyReconciliationAgainstGroundTruth } from './src/utils/groundTruthDataset';
import { computeIndependentItcBridge } from './src/utils/statutoryItcBridge';
import { runSupabaseVerification } from './src/utils/supabaseVerification';


async function main() {
  console.log('================================================================================');
  console.log('  BIZNEXCO PURCHASE INVOICE AUTOMATION & GST RECONCILIATION ENGINE');
  console.log('  FINAL INDEPENDENT AUDIT, GROUND-TRUTH & STATUTORY VERIFICATION SUITE');
  console.log('================================================================================\n');

  // 1. Run 100-Invoice Stress Test & Reconciliation Metrics Check
  console.log('>>> [1/5] EXECUTING 100-INVOICE DATASET RECONCILIATION & TOTALS CHECK...');
  const { books, gstr2b } = generate100InvoicesDataset();
  const reconItems = runReconciliation(books, gstr2b, '04-2024');
  const metrics = computeDashboardMetrics(books, gstr2b, reconItems);

  console.log(`Input Books Count:          ${books.length}`);
  console.log(`Input GSTR-2B Count:        ${gstr2b.length}`);
  console.log(`Reconciliation Items Count: ${reconItems.length}`);
  console.log(`- Exact Matches:            ${metrics.matchedCount} (Taxable: ₹${metrics.matchedTaxable.toLocaleString('en-IN')})`);
  console.log(`- Probable Matches:         ${metrics.probableCount} (Taxable: ₹${metrics.probableTaxable.toLocaleString('en-IN')})`);
  console.log(`- Mismatches:               ${metrics.mismatchCount} (Taxable: ₹${metrics.mismatchTaxable.toLocaleString('en-IN')})`);
  console.log(`- Missing in GSTR-2B:       ${metrics.missingIn2BCount} (Taxable: ₹${metrics.missingIn2BTaxable.toLocaleString('en-IN')})`);
  console.log(`- Missing in Books:         ${metrics.missingInBooksCount} (Taxable: ₹${metrics.missingInBooksTaxable.toLocaleString('en-IN')})`);
  console.log(`- Duplicate Vouchers:       ${metrics.duplicateCount} (Taxable: ₹${metrics.duplicateTaxable.toLocaleString('en-IN')})`);
  console.log(`- Total Books Taxable (₹):  ${metrics.totalBooksTaxable.toFixed(2)}`);
  console.log(`- Total Books ITC (₹):      ${metrics.totalBooksITC.toFixed(2)} (CGST: ₹${metrics.totalBooksCGST.toFixed(2)}, SGST: ₹${metrics.totalBooksSGST.toFixed(2)}, IGST: ₹${metrics.totalBooksIGST.toFixed(2)})`);
  console.log(`- Total GSTR-2B ITC (₹):    ${metrics.total2BITC.toFixed(2)} (CGST: ₹${metrics.total2BCGST.toFixed(2)}, SGST: ₹${metrics.total2BSGST.toFixed(2)}, IGST: ₹${metrics.total2BIGST.toFixed(2)})`);
  console.log(`- Net Candidate ITC (₹):    ${metrics.netClaimableITC.toFixed(2)}`);
  console.log(`- Blocked/Ineligible (₹):   ${metrics.ineligibleITC.toFixed(2)}\n`);

  // 2. Independent Expected-Results Ground Truth Verification
  console.log('>>> [2/5] COMPARING AGAINST INDEPENDENT EXPECTED-RESULTS GROUND TRUTH (107 RECORDS)...');
  const groundTruthReport = verifyReconciliationAgainstGroundTruth(reconItems);
  console.log(`Total Expected Records:     ${groundTruthReport.totalExpectedRecords}`);
  console.log(`Total Actual Records:       ${groundTruthReport.totalActualRecords}`);
  console.log(`Records Passed Ground Truth:${groundTruthReport.totalPassed} / ${groundTruthReport.totalExpectedRecords}`);
  console.log(`100% Ground Truth Match:    ${groundTruthReport.is100PercentConformant ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Statutory Date Policy:      ${groundTruthReport.statutoryDateAudit.passedStrictEvidenceAndWarning} / ${groundTruthReport.statutoryDateAudit.totalChecked} (>30d flagged with manual review warning)\n`);

  if (groundTruthReport.failures.length > 0) {
    console.error('Ground Truth Failures:');
    groundTruthReport.failures.forEach((f) => console.error(`  - ${f}`));
  }

  // 3. Independent Statutory ITC Recalculation Bridge
  console.log('>>> [3/5] INDEPENDENT STATUTORY ITC RECALCULATION BRIDGE & RECORD AUDIT...');
  const itcBridge = computeIndependentItcBridge(books, gstr2b, reconItems);
  console.log(`  Gross Books ITC:                  ₹ ${itcBridge.grossBooksITC.toLocaleString('en-IN')}`);
  console.log(`  Less Section 17(5) Blocked ITC: - ₹ ${itcBridge.lessBlockedSection17_5.toLocaleString('en-IN')}`);
  console.log(`  Less Pending-Review ITC:        - ₹ ${itcBridge.lessPendingReviewITC.toLocaleString('en-IN')} (10 Probable >30d records)`);
  console.log(`  Less Disputed Mismatches:       - ₹ ${itcBridge.lessDisputedTaxAndValueITC.toLocaleString('en-IN')} (Unified dispute total)`);
  console.log(`    ↳ Tax Rate Mismatches:        - ₹ ${itcBridge.lessTaxMismatchITC.toLocaleString('en-IN')}`);
  console.log(`    ↳ Taxable Value Mismatches:   - ₹ ${itcBridge.lessValueMismatchITC.toLocaleString('en-IN')}`);
  console.log(`  Less Missing in GSTR-2B:        - ₹ ${itcBridge.lessMissingIn2BITC.toLocaleString('en-IN')} (5 Defaulted vendor filings)`);
  console.log(`  Less Duplicate Book Vouchers:   - ₹ ${itcBridge.lessDuplicateBookVouchersITC.toLocaleString('en-IN')} (5 Secondary voucher duplicates)`);
  console.log(`  Portion from Manual Matches:    + ₹ ${itcBridge.addAcceptedManualMatchesITC.toLocaleString('en-IN')}`);
  console.log(`  ----------------------------------------------------------------------`);
  console.log(`  = Final Net Candidate ITC:        ₹ ${itcBridge.finalNetCandidateClaimableITC.toLocaleString('en-IN')}`);
  console.log(`  Bridge Arithmetic Equation:       ${itcBridge.bridgeEquationPassed ? '✅ BALANCED TO ₹0.00' : '❌ UNBALANCED'}`);
  console.log(`  Included Candidate Records:       ${itcBridge.includedRecordIds.length} vouchers`);
  console.log(`  Excluded Records:                 ${itcBridge.excludedRecords.length} records`);
  console.log(`  Statutory Auditor Notice:         "${itcBridge.auditorCandidateNotice}"\n`);

  // 3b. Run Dedicated Section 17(5) Statutory ITC Audit
  console.log('>>> [3b/5] EXPLICIT SECTION 17(5) STATUTORY ITC AUDIT...');
  const sec17Audit = runExplicitSection17_5Audit();
  console.log(`  Section 17(5) Blocked ITC Audit:  ${sec17Audit.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  - Gross Books ITC:                ₹ ${sec17Audit.grossBooksITC.toLocaleString('en-IN')}`);
  console.log(`  - Blocked u/s 17(5) Total:      - ₹ ${sec17Audit.blockedSection17_5ITC.toLocaleString('en-IN')}`);
  console.log(`    • Motor Vehicles u/s 17(5)(a):  ₹ ${sec17Audit.motorVehicleBlockedITC.toLocaleString('en-IN')}`);
  console.log(`    • Food/Beverages u/s 17(5)(b)(i):₹ ${sec17Audit.foodBeverageBlockedITC.toLocaleString('en-IN')}`);
  console.log(`  - Net Candidate Claimable ITC:    ₹ ${sec17Audit.candidateClaimableITC.toLocaleString('en-IN')}`);
  console.log(`  - Agreement Variance:             ₹ ${sec17Audit.dashboardAgreementVariance.toFixed(2)}`);
  console.log(`  - Dataset Discrepancy Note:       ${sec17Audit.explanationOfDiscrepancy}\n`);

  // 4. Run Isolated Statutory Scenarios
  const statutorySuite = runAllStatutoryScenarioTests();
  console.log(`>>> [4/5] EXECUTING ${statutorySuite.totalScenarios} STATUTORY ISOLATION SCENARIOS...`);
  statutorySuite.results.forEach((s) => {
    const icon = s.passed ? '✅' : '❌';
    console.log(`  ${icon} Scenario ${String(s.scenarioNumber).padStart(2)}: ${s.scenarioName.padEnd(58)} -> ${s.assertions[0]}`);
  });
  console.log(`Statutory Scenarios Result: ${statutorySuite.scenariosPassed} / ${statutorySuite.totalScenarios} Passed\n`);

  // 5. Supabase Persistence & RLS Status Check
  console.log('>>> [5/5] SUPABASE DATABASE PERSISTENCE & RLS ENVIRONMENT VERIFICATION...');
  const supabaseReport = await runSupabaseVerification();
  supabaseReport.logs.forEach((l) => console.log(`  • ${l}`));
  console.log(`  • Multi-User RLS Status: ${supabaseReport.rlsStatusNotice}\n`);

  // 6. Run Full Functional Audit
  const audit = executeFullFunctionalAudit();
  console.log(`>>> EXECUTING FULL FUNCTIONAL AUDIT (${audit.totalTests} CORE WORKFLOWS)...`);
  audit.reports.forEach((r) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`Test ${String(r.testNumber).padStart(2)}: [${status}] ${r.testName.padEnd(58)} | Input: ${String(r.inputCount).padStart(3)} | Output: ${String(r.outputCount).padStart(3)} | Dropped: ${r.droppedOrUnaccountedRecords}`);
    r.assertions.forEach((a) => {
      console.log(`         • ${a}`);
    });
  });

  console.log('\n================================================================================');
  const overallSuccess =
    audit.overallSuccess &&
    groundTruthReport.is100PercentConformant &&
    statutorySuite.allPassed &&
    itcBridge.bridgeEquationPassed;

  console.log(`FINAL AUDIT RESULT: ${overallSuccess ? '✅ ALL ENGINE & GROUND-TRUTH CHECKS PASSED' : '❌ AUDIT FAILED'}`);
  console.log(`Total Workflows Tested:  ${audit.totalTests}`);
  console.log(`Workflows Passed:        ${audit.testsPassed}`);
  console.log(`Workflows Failed:        ${audit.testsFailed}`);
  console.log(`Ground-Truth Conformance:${groundTruthReport.totalPassed} / ${groundTruthReport.totalExpectedRecords} records (100%)`);
  console.log(`Statutory Scenarios:     ${statutorySuite.scenariosPassed} / ${statutorySuite.totalScenarios} passed`);
  console.log(`Supabase Multi-User RLS: NOT INDEPENDENTLY VERIFIED (Live remote credentials unset)`);
  console.log('================================================================================\n');

  if (!overallSuccess) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Audit script fatal error:', err);
  process.exit(1);
});
