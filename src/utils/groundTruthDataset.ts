import { MatchType, ReconciliationItem, ReviewStatus } from '../types';

export interface ExpectedReconciliationResult {
  recordKey: string;
  expectedBookId?: string;
  expected2BId?: string;
  expectedSupplierGstin?: string;
  expectedInvoiceNumber?: string;
  expectedMatchType: MatchType;
  expectedConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  expectedStatus: ReviewStatus;
  expectedTaxableDiff: number;
  expectedCgstDiff: number;
  expectedSgstDiff: number;
  expectedIgstDiff: number;
  isDateDiffOver30Days?: boolean;
  expectedMatchingMethod: string;
  expectedItcCategory: string;
  description: string;
}

export function buildExpectedGroundTruth(): ExpectedReconciliationResult[] {
  const expectedList: ExpectedReconciliationResult[] = [];

  // Group 1: 30 Canonical Exact Matches (book_exact_1 .. 30 with g2b_exact_1 .. 30)
  for (let i = 1; i <= 30; i++) {
    expectedList.push({
      recordKey: `exact_${i}`,
      expectedBookId: `book_exact_${i}`,
      expected2BId: `g2b_exact_${i}`,
      expectedMatchType: 'EXACT',
      expectedConfidence: 'HIGH',
      expectedStatus: 'ACCEPTED',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'EXACT_CANONICAL',
      expectedItcCategory: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
      description: `Canonical Exact Match #${i}`,
    });
  }

  // Group 2: 15 Normalized Number Exact Matches (book_varnum_1 .. 15 with g2b_varnum_1 .. 15)
  for (let i = 1; i <= 15; i++) {
    expectedList.push({
      recordKey: `varnum_${i}`,
      expectedBookId: `book_varnum_${i}`,
      expected2BId: `g2b_varnum_${i}`,
      expectedMatchType: 'EXACT',
      expectedConfidence: 'HIGH',
      expectedStatus: 'ACCEPTED',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'EXACT_NORMALIZED_INVOICE_NUMBER',
      expectedItcCategory: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
      description: `Normalized Invoice Number Exact Match #${i}`,
    });
  }

  // Group 3: 10 Taxable Value Disputes (book_valdiff_1 .. 10 with g2b_valdiff_1 .. 10)
  // Books taxable was higher by ₹2500, so 2B - Books = -2500
  for (let i = 1; i <= 10; i++) {
    const isInter = [1, 4, 5, 7, 9, 10].includes(i);
    expectedList.push({
      recordKey: `valdiff_${i}`,
      expectedBookId: `book_valdiff_${i}`,
      expected2BId: `g2b_valdiff_${i}`,
      expectedMatchType: 'MISMATCH_VALUE',
      expectedConfidence: 'MEDIUM',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: -2500,
      expectedCgstDiff: isInter ? 0 : -225,
      expectedSgstDiff: isInter ? 0 : -225,
      expectedIgstDiff: isInter ? -450 : 0,
      expectedMatchingMethod: 'MISMATCH_TAXABLE_VALUE',
      expectedItcCategory: 'INELIGIBLE_MISMATCH',
      description: `Taxable Value Dispute #${i}`,
    });
  }

  // Group 4: 10 Tax Rate Disputes (book_taxdiff_1 .. 10 with g2b_taxdiff_1 .. 10)
  // Taxable matches, but 2B applied 12% while Books applied 18% (-6% difference)
  for (let i = 1; i <= 10; i++) {
    const isInter = [2, 4, 5, 7, 8, 9].includes(i);
    const taxable = 60000 + (i - 1) * 4000;
    const diff = -(taxable * 0.06);
    expectedList.push({
      recordKey: `taxdiff_${i}`,
      expectedBookId: `book_taxdiff_${i}`,
      expected2BId: `g2b_taxdiff_${i}`,
      expectedMatchType: 'MISMATCH_TAX',
      expectedConfidence: 'MEDIUM',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: 0,
      expectedCgstDiff: isInter ? 0 : diff / 2,
      expectedSgstDiff: isInter ? 0 : diff / 2,
      expectedIgstDiff: isInter ? diff : 0,
      expectedMatchingMethod: 'MISMATCH_TAX_RATE',
      expectedItcCategory: 'INELIGIBLE_MISMATCH',
      description: `Tax Rate Dispute #${i}`,
    });
  }

  // Group 5: 10 Date Variations > 30 Days (book_datevar_1 .. 10 with g2b_datevar_1 .. 10)
  // Books Feb 2024 vs 2B Apr 2024 (approx 60 days). Amounts match. Strong supporting evidence present.
  for (let i = 1; i <= 10; i++) {
    expectedList.push({
      recordKey: `datevar_${i}`,
      expectedBookId: `book_datevar_${i}`,
      expected2BId: `g2b_datevar_${i}`,
      expectedMatchType: 'PROBABLE',
      expectedConfidence: 'MEDIUM',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      isDateDiffOver30Days: true,
      expectedMatchingMethod: 'PROBABLE_DATE_VARIANCE_OVER_30_DAYS',
      expectedItcCategory: 'PENDING_AUDITOR_REVIEW',
      description: `Date Disparity >30d Probable Match #${i}`,
    });
  }

  // Group 6A: 5 Duplicate Legitimate Originals in Books (book_dup_orig_1 .. 5 with g2b_dup_legit_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    expectedList.push({
      recordKey: `dup_orig_${i}`,
      expectedBookId: `book_dup_orig_${i}`,
      expected2BId: `g2b_dup_legit_${i}`,
      expectedMatchType: 'EXACT',
      expectedConfidence: 'HIGH',
      expectedStatus: 'ACCEPTED',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'EXACT_CANONICAL',
      expectedItcCategory: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
      description: `Legitimate Original Duplicate Pair #${i}`,
    });
  }

  // Group 6B: 5 Duplicate Copies in Books (book_dup_copy_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    expectedList.push({
      recordKey: `dup_copy_${i}`,
      expectedBookId: `book_dup_copy_${i}`,
      expected2BId: undefined,
      expectedMatchType: 'DUPLICATE',
      expectedConfidence: 'LOW',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'DUPLICATE_PURCHASE_REGISTER_PASS_0',
      expectedItcCategory: 'INELIGIBLE_MISMATCH',
      description: `Duplicate Book Voucher Copy #${i}`,
    });
  }

  // Group 7: 5 Missing in GSTR-2B (book_miss2b_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    const taxable = 75000 + (i - 1) * 5000;
    const isInter = [1, 3, 4].includes(i);
    const tax = taxable * 0.18;
    expectedList.push({
      recordKey: `miss2b_${i}`,
      expectedBookId: `book_miss2b_${i}`,
      expected2BId: undefined,
      expectedMatchType: 'MISSING_IN_2B',
      expectedConfidence: 'LOW',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: -taxable,
      expectedCgstDiff: isInter ? 0 : -(tax / 2),
      expectedSgstDiff: isInter ? 0 : -(tax / 2),
      expectedIgstDiff: isInter ? -tax : 0,
      expectedMatchingMethod: 'UNMATCHED_BOOKS_ABSENT_IN_2B',
      expectedItcCategory: 'INELIGIBLE_MISMATCH',
      description: `Missing in GSTR-2B Vendor Default #${i}`,
    });
  }

  // Group 8: 5 Credit Notes (book_crn_1 .. 5 with g2b_crn_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    expectedList.push({
      recordKey: `crn_${i}`,
      expectedBookId: `book_crn_${i}`,
      expected2BId: `g2b_crn_${i}`,
      expectedMatchType: 'EXACT',
      expectedConfidence: 'HIGH',
      expectedStatus: 'ACCEPTED',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'EXACT_CANONICAL',
      expectedItcCategory: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
      description: `Credit Note Exact Match #${i}`,
    });
  }

  // Group 9: 5 Debit Notes (book_dbn_1 .. 5 with g2b_dbn_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    expectedList.push({
      recordKey: `dbn_${i}`,
      expectedBookId: `book_dbn_${i}`,
      expected2BId: `g2b_dbn_${i}`,
      expectedMatchType: 'EXACT',
      expectedConfidence: 'HIGH',
      expectedStatus: 'ACCEPTED',
      expectedTaxableDiff: 0,
      expectedCgstDiff: 0,
      expectedSgstDiff: 0,
      expectedIgstDiff: 0,
      expectedMatchingMethod: 'EXACT_CANONICAL',
      expectedItcCategory: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
      description: `Debit Note Exact Match #${i}`,
    });
  }

  // Group 10: 5 Missing in Books (g2b_missbooks_1 .. 5)
  for (let i = 1; i <= 5; i++) {
    const taxable = 30000 + (i - 1) * 3500;
    const isInter = [1, 3, 4, 5].includes(i);
    const tax = taxable * 0.18;
    expectedList.push({
      recordKey: `missbooks_${i}`,
      expectedBookId: undefined,
      expected2BId: `g2b_missbooks_${i}`,
      expectedMatchType: 'MISSING_IN_BOOKS',
      expectedConfidence: 'LOW',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: taxable,
      expectedCgstDiff: isInter ? 0 : tax / 2,
      expectedSgstDiff: isInter ? 0 : tax / 2,
      expectedIgstDiff: isInter ? tax : 0,
      expectedMatchingMethod: 'UNMATCHED_2B_ABSENT_IN_BOOKS',
      expectedItcCategory: 'PENDING_AUDITOR_REVIEW',
      description: `Missing in Books Unclaimed ITC Record #${i}`,
    });
  }

  // Group 11: 2 Duplicate Vendor Filings in GSTR-2B (g2b_dup_vendor_mistake_1 & 2)
  for (let i = 1; i <= 2; i++) {
    const taxable = i === 1 ? 23000 : 26000;
    expectedList.push({
      recordKey: `dup_2b_${i}`,
      expectedBookId: undefined,
      expected2BId: `g2b_dup_vendor_mistake_${i}`,
      expectedMatchType: 'DUPLICATE',
      expectedConfidence: 'LOW',
      expectedStatus: 'PENDING_REVIEW',
      expectedTaxableDiff: taxable,
      expectedCgstDiff: i === 1 ? 575 : 0,
      expectedSgstDiff: i === 1 ? 575 : 0,
      expectedIgstDiff: i === 1 ? 0 : 3120,
      expectedMatchingMethod: 'DUPLICATE_VENDOR_FILING_GSTR2B',
      expectedItcCategory: 'INELIGIBLE_MISMATCH',
      description: `Duplicate Vendor Filing in 2B #${i}`,
    });
  }

  return expectedList;
}

export interface GroundTruthVerificationReport {
  is100PercentConformant: boolean;
  totalExpectedRecords: number;
  totalActualRecords: number;
  totalPassed: number;
  totalFailed: number;
  failures: string[];
  exactMatchesCount: number;
  probableMatchesCount: number;
  mismatchesCount: number;
  missingIn2BCount: number;
  missingInBooksCount: number;
  duplicateCount: number;
  statutoryDateAudit: {
    totalChecked: number;
    passedStrictEvidenceAndWarning: number;
  };
}

export function verifyReconciliationAgainstGroundTruth(
  actualItems: ReconciliationItem[]
): GroundTruthVerificationReport {
  const expectedItems = buildExpectedGroundTruth();
  const failures: string[] = [];

  let exactCount = 0;
  let probableCount = 0;
  let mismatchCount = 0;
  let missing2BCount = 0;
  let missingBooksCount = 0;
  let duplicateCount = 0;

  actualItems.forEach((it) => {
    if (it.matchType === 'EXACT') exactCount++;
    else if (it.matchType === 'PROBABLE') probableCount++;
    else if (it.matchType === 'MISMATCH_TAX' || it.matchType === 'MISMATCH_VALUE' || it.matchType === 'CRN_DBN_DIFF')
      mismatchCount++;
    else if (it.matchType === 'MISSING_IN_2B') missing2BCount++;
    else if (it.matchType === 'MISSING_IN_BOOKS') missingBooksCount++;
    else if (it.matchType === 'DUPLICATE') duplicateCount++;
  });

  let statutoryDateAudited = 0;
  let statutoryDatePassed = 0;

  let passed = 0;

  for (const exp of expectedItems) {
    // Find matching actual record
    const actual = actualItems.find((a) => {
      if (exp.expectedBookId && exp.expected2BId) {
        return a.bookInvoice?.id === exp.expectedBookId && a.gstr2bRecord?.id === exp.expected2BId;
      }
      if (exp.expectedBookId && !exp.expected2BId) {
        return a.bookInvoice?.id === exp.expectedBookId && !a.gstr2bRecord;
      }
      if (!exp.expectedBookId && exp.expected2BId) {
        return !a.bookInvoice && a.gstr2bRecord?.id === exp.expected2BId;
      }
      return false;
    });

    if (!actual) {
      failures.push(
        `[MISSING RECORD] Expected ${exp.description} (Book: ${exp.expectedBookId || 'none'}, 2B: ${
          exp.expected2BId || 'none'
        }) not found in actual output.`
      );
      continue;
    }

    const itemErrors: string[] = [];
    const supplierGstin = actual.bookInvoice?.supplierGstin || actual.gstr2bRecord?.supplierGstin || 'UNKNOWN';
    const invoiceNumber = actual.bookInvoice?.invoiceNumber || actual.gstr2bRecord?.invoiceNumber || 'UNKNOWN';

    // 1. Verify Match Type
    if (actual.matchType !== exp.expectedMatchType) {
      itemErrors.push(`MatchType mismatch: expected '${exp.expectedMatchType}', got '${actual.matchType}'`);
    }

    // 2. Verify Confidence Level
    if (actual.confidenceLevel !== exp.expectedConfidence) {
      itemErrors.push(`Confidence mismatch: expected '${exp.expectedConfidence}', got '${actual.confidenceLevel}'`);
    }

    // 3. Verify Review Status
    if (actual.status !== exp.expectedStatus) {
      itemErrors.push(`Status mismatch: expected '${exp.expectedStatus}', got '${actual.status}'`);
    }

    // 4. Verify Matching Method
    if (actual.matchingMethod !== exp.expectedMatchingMethod) {
      itemErrors.push(`MatchingMethod mismatch: expected '${exp.expectedMatchingMethod}', got '${actual.matchingMethod}'`);
    }

    // 5. Verify ITC Eligibility Category
    if (actual.itcEligibilityCategory !== exp.expectedItcCategory) {
      itemErrors.push(`ITCCategory mismatch: expected '${exp.expectedItcCategory}', got '${actual.itcEligibilityCategory}'`);
    }

    // 6. Verify Date disparity logic (>30 days must have warning & pending review)
    if (exp.isDateDiffOver30Days) {
      statutoryDateAudited++;
      const dateDiffDays = actual.dateDifferenceDays || 0;
      const hasWarning =
        actual.manualReviewWarning !== undefined && actual.manualReviewWarning.includes('MANUAL REVIEW REQUIRED');
      const isPending = actual.status === 'PENDING_REVIEW';
      const hasEvidence = (actual.supportingEvidence?.length || 0) >= 4;

      if (dateDiffDays > 30 && hasWarning && isPending && hasEvidence) {
        statutoryDatePassed++;
      } else {
        itemErrors.push(
          `Statutory date policy violated for ${exp.description}: dateDiff=${dateDiffDays}, warning=${Boolean(
            hasWarning
          )}, status=${actual.status}, evidenceCount=${actual.supportingEvidence?.length}`
        );
      }
    }

    // 7. Verify Taxable Diff within ₹0.05
    if (Math.abs(actual.taxableDiff - exp.expectedTaxableDiff) > 0.05) {
      itemErrors.push(
        `TaxableDiff mismatch: expected ${exp.expectedTaxableDiff}, got ${actual.taxableDiff.toFixed(2)}`
      );
    }

    // 8. Verify CGST, SGST, IGST Diffs within ₹0.05
    if (Math.abs(actual.cgstDiff - exp.expectedCgstDiff) > 0.05) {
      itemErrors.push(`CGSTDiff mismatch: expected ${exp.expectedCgstDiff}, got ${actual.cgstDiff.toFixed(2)}`);
    }
    if (Math.abs(actual.sgstDiff - exp.expectedSgstDiff) > 0.05) {
      itemErrors.push(`SGSTDiff mismatch: expected ${exp.expectedSgstDiff}, got ${actual.sgstDiff.toFixed(2)}`);
    }
    if (Math.abs(actual.igstDiff - exp.expectedIgstDiff) > 0.05) {
      itemErrors.push(`IGSTDiff mismatch: expected ${exp.expectedIgstDiff}, got ${actual.igstDiff.toFixed(2)}`);
    }

    if (itemErrors.length === 0) {
      passed++;
    } else {
      failures.push(
        `[Record: ${actual.id}] [GSTIN: ${supplierGstin}] [InvNo: ${invoiceNumber}]: ${itemErrors.join(' | ')}`
      );
    }
  }

  return {
    is100PercentConformant: failures.length === 0 && actualItems.length === expectedItems.length,
    totalExpectedRecords: expectedItems.length,
    totalActualRecords: actualItems.length,
    totalPassed: passed,
    totalFailed: failures.length,
    failures,
    exactMatchesCount: exactCount,
    probableMatchesCount: probableCount,
    mismatchesCount: mismatchCount,
    missingIn2BCount: missing2BCount,
    missingInBooksCount: missingBooksCount,
    duplicateCount,
    statutoryDateAudit: {
      totalChecked: statutoryDateAudited,
      passedStrictEvidenceAndWarning: statutoryDatePassed,
    },
  };
}

