import { executeFullFunctionalAudit } from '../src/utils/functionalAuditRunner';

console.log('================================================================================');
console.log('BIZNEXCO PURCHASE INVOICE AUTOMATION & GST RECONCILIATION - COMPLETE AUDIT');
console.log('================================================================================\n');

const auditResult = executeFullFunctionalAudit();

auditResult.reports.forEach((report) => {
  const statusBadge = report.passed ? '✓ PASSED' : '✗ FAILED';
  console.log(`[TEST ${report.testNumber}] ${report.testName}: ${statusBadge}`);
  console.log(`  • Input Count:                      ${report.inputCount}`);
  console.log(`  • Output Count:                     ${report.outputCount}`);
  console.log(`  • Matched Count:                    ${report.matchedCount}`);
  console.log(`  • Mismatch Count:                   ${report.mismatchCount}`);
  console.log(`  • Missing in 2B Count:              ${report.missingIn2BCount}`);
  console.log(`  • Missing in Books Count:           ${report.missingInBooksCount}`);
  console.log(`  • Duplicate Count:                  ${report.duplicateCount}`);
  console.log(`  • Dropped/Unaccounted Records:      ${report.droppedOrUnaccountedRecords}`);
  console.log(`  • Total Taxable Value:              ₹${report.taxableValueTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  • Total CGST:                       ₹${report.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  • Total SGST:                       ₹${report.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  • Total IGST:                       ₹${report.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  • Total ITC Claimable/Eligible:     ₹${report.itcTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log('  • Key Assertions:');
  report.assertions.forEach((a) => console.log(`      - ${a}`));
  console.log('');
});

console.log('--------------------------------------------------------------------------------');
console.log(`FINAL SUMMARY: ${auditResult.testsPassed} / ${auditResult.totalTests} TESTS PASSED`);
if (auditResult.overallSuccess) {
  console.log('STATUS: ALL 9 END-TO-END WORKFLOWS COMPLETED SUCCESSFULLY WITH ZERO DEFECTS.');
  process.exit(0);
} else {
  console.error(`STATUS: ${auditResult.testsFailed} TESTS FAILED.`);
  process.exit(1);
}
