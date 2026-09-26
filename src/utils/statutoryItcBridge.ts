import { GSTR2BRecord, PurchaseInvoice, ReconciliationItem } from '../types';
import { computeInvoiceItcBreakdown } from './itcEligibilityHelper';

export interface ExcludedItcRecord {
  id: string;
  invoiceNumber: string;
  supplierGstin: string;
  documentType: string;
  amount: number;
  reason: string;
}

export interface StatutoryItcBridgeResult {
  grossBooksITC: number;
  lessBlockedSection17_5: number;
  lessPendingReviewITC: number;
  lessTaxMismatchITC: number;
  lessValueMismatchITC: number;
  lessDisputedTaxAndValueITC: number;
  lessMissingIn2BITC: number;
  lessDuplicateBookVouchersITC: number;
  addAcceptedManualMatchesITC: number;
  finalNetCandidateClaimableITC: number;
  gstr2bITC: number;
  missingInBooksUnclaimedITC: number;
  includedRecordIds: string[];
  excludedRecords: ExcludedItcRecord[];
  bridgeEquationPassed: boolean;
  auditorCandidateNotice: string;
}

/**
 * Independent Statutory ITC Recalculation Bridge
 * Completely recalculates Net Candidate Claimable ITC from source records without relying on the UI totals.
 */
export function computeIndependentItcBridge(
  books: PurchaseInvoice[],
  gstr2b: GSTR2BRecord[],
  reconItems: ReconciliationItem[]
): StatutoryItcBridgeResult {
  let grossBooksITC = 0;
  let lessBlockedSection17_5 = 0;
  let gstr2bITC = 0;

  // 1. Independently compute Gross Books ITC directly from source book vouchers
  for (const b of books) {
    const sign = b.documentType === 'CRN' ? -1 : 1;
    const itc = (b.cgstAmount + b.sgstAmount + b.igstAmount) * sign;
    grossBooksITC += itc;

    const breakdown = computeInvoiceItcBreakdown(b);
    lessBlockedSection17_5 += breakdown.blockedITC;
  }

  // 2. Independently compute GSTR-2B ITC from 2B source records
  for (const g of gstr2b) {
    const sign = g.documentType === 'CRN' ? -1 : 1;
    gstr2bITC += (g.cgstAmount + g.sgstAmount + g.igstAmount) * sign;
  }

  let lessPendingReviewITC = 0;
  let lessTaxMismatchITC = 0;
  let lessValueMismatchITC = 0;
  let lessMissingIn2BITC = 0;
  let lessDuplicateBookVouchersITC = 0;
  let addAcceptedManualMatchesITC = 0;
  let missingInBooksUnclaimedITC = 0;

  const includedRecordIds: string[] = [];
  const excludedRecords: ExcludedItcRecord[] = [];

  // 3. Process each reconciliation item through strict statutory rules
  for (const r of reconItems) {
    const bookSign = r.bookInvoice?.documentType === 'CRN' ? -1 : 1;
    const g2bSign = r.gstr2bRecord?.documentType === 'CRN' ? -1 : 1;

    const bookTax = r.bookInvoice
      ? (r.bookInvoice.cgstAmount + r.bookInvoice.sgstAmount + r.bookInvoice.igstAmount) * bookSign
      : 0;

    const g2bTax = r.gstr2bRecord
      ? (r.gstr2bRecord.cgstAmount + r.gstr2bRecord.sgstAmount + r.gstr2bRecord.igstAmount) * g2bSign
      : 0;

    const invNo = r.bookInvoice?.invoiceNumber || r.gstr2bRecord?.invoiceNumber || 'UNKNOWN';
    const gstin = r.bookInvoice?.supplierGstin || r.gstr2bRecord?.supplierGstin || 'UNKNOWN';
    const docType = r.bookInvoice?.documentType || r.gstr2bRecord?.documentType || 'INV';

    const breakdown = r.bookInvoice ? computeInvoiceItcBreakdown(r.bookInvoice) : null;
    const blockedTax = breakdown?.blockedITC ?? 0;
    const eligibleTax = breakdown?.eligibleITC ?? 0;
    const pendingTax = breakdown?.pendingReviewITC ?? 0;

    // Case A: Entire invoice is 100% blocked u/s 17(5)
    // Deduction is ALREADY accounted for in lessBlockedSection17_5 at the Gross Books level.
    // To strictly prevent double-counting across dispute/pending/missing buckets,
    // blocked vouchers must NOT be added to lessPendingReviewITC, lessTaxMismatchITC, etc.
    if (breakdown && blockedTax > 0 && eligibleTax === 0 && pendingTax === 0) {
      excludedRecords.push({
        id: r.id,
        invoiceNumber: invNo,
        supplierGstin: gstin,
        documentType: docType,
        amount: bookTax,
        reason: `Section 17(5) Blocked / Ineligible ITC (Motor vehicles u/s 17(5)(a) / Food & beverages u/s 17(5)(b)(i) / Personal consumption)${
          r.matchType !== 'EXACT' ? ` [Reconciliation Status: ${r.matchType}]` : ''
        }`,
      });
      continue;
    }

    // Case B: Mixed invoice with blocked line item(s)
    // The blocked line items are recorded in excludedRecords for auditor audit trail
    if (breakdown && blockedTax > 0 && (eligibleTax > 0 || pendingTax > 0)) {
      breakdown.blockedLineItems.forEach((item, idx) => {
        excludedRecords.push({
          id: `${r.id}_blocked_line_${idx}`,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: item.tax,
          reason: `Section 17(5) Blocked Line Item: ${item.line.description} (${item.reason})`,
        });
      });
    }

    // Case C: Ambiguous or unverified line items (itcEligibility: 'PENDING')
    // Statutory safety rule: Never automatically classify ambiguous line items as eligible
    if (pendingTax > 0) {
      lessPendingReviewITC += pendingTax;
      breakdown?.pendingLineItems.forEach((item, idx) => {
        excludedRecords.push({
          id: `${r.id}_pending_line_${idx}`,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: item.tax,
          reason: `Ambiguous / Unverified Line Item: ${item.line.description} (${item.reason}) - held for auditor confirmation`,
        });
      });
    }

    // Active eligible amount to be reconciled against GSTR-2B
    const activeEligibleTax = eligibleTax > 0 ? eligibleTax : (blockedTax === 0 && pendingTax === 0 ? bookTax : 0);

    if (r.matchType === 'EXACT') {
      if (r.status === 'ACCEPTED') {
        includedRecordIds.push(r.id);
      } else {
        lessPendingReviewITC += activeEligibleTax;
        excludedRecords.push({
          id: r.id,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: activeEligibleTax,
          reason: `Exact match not confirmed (Status: ${r.status})`,
        });
      }
    } else if (r.matchType === 'MANUAL_MATCH') {
      if (r.status === 'ACCEPTED') {
        addAcceptedManualMatchesITC += activeEligibleTax;
        includedRecordIds.push(r.id);
      } else {
        lessPendingReviewITC += activeEligibleTax;
        excludedRecords.push({
          id: r.id,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: activeEligibleTax,
          reason: `Manual match pending auditor acceptance (Status: ${r.status})`,
        });
      }
    } else if (r.matchType === 'PROBABLE') {
      if (r.status === 'ACCEPTED') {
        includedRecordIds.push(r.id);
      } else {
        lessPendingReviewITC += activeEligibleTax;
        excludedRecords.push({
          id: r.id,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: activeEligibleTax,
          reason: r.manualReviewWarning || 'Probable match: Date variance >30 days or fuzzy match pending audit confirmation',
        });
      }
    } else if (r.matchType === 'MISMATCH_TAX') {
      lessTaxMismatchITC += activeEligibleTax;
      excludedRecords.push({
        id: r.id,
        invoiceNumber: invNo,
        supplierGstin: gstin,
        documentType: docType,
        amount: activeEligibleTax,
        reason: `Tax dispute (MISMATCH_TAX): Rate / tax amount difference between Books and GSTR-2B must be reconciled before claim`,
      });
    } else if (r.matchType === 'MISMATCH_VALUE' || r.matchType === 'CRN_DBN_DIFF') {
      lessValueMismatchITC += activeEligibleTax;
      excludedRecords.push({
        id: r.id,
        invoiceNumber: invNo,
        supplierGstin: gstin,
        documentType: docType,
        amount: activeEligibleTax,
        reason: `Value / polarity dispute (${r.matchType}): Variance between Books and GSTR-2B must be reconciled before claim`,
      });
    } else if (r.matchType === 'MISSING_IN_2B') {
      lessMissingIn2BITC += activeEligibleTax;
      excludedRecords.push({
        id: r.id,
        invoiceNumber: invNo,
        supplierGstin: gstin,
        documentType: docType,
        amount: activeEligibleTax,
        reason: 'Missing in GSTR-2B: Supplier has not filed GSTR-1; statutory condition under Section 16(2)(aa) unsatisfied',
      });
    } else if (r.matchType === 'DUPLICATE') {
      if (r.bookInvoice) {
        lessDuplicateBookVouchersITC += activeEligibleTax;
        excludedRecords.push({
          id: r.id,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: activeEligibleTax,
          reason: 'Duplicate purchase voucher in Books: Secondary copy held to prevent double ITC claim',
        });
      } else {
        excludedRecords.push({
          id: r.id,
          invoiceNumber: invNo,
          supplierGstin: gstin,
          documentType: docType,
          amount: g2bTax,
          reason: 'Duplicate filing in GSTR-2B: Vendor duplicate filing held to prevent double uptake',
        });
      }
    } else if (r.matchType === 'MISSING_IN_BOOKS') {
      missingInBooksUnclaimedITC += g2bTax;
      excludedRecords.push({
        id: r.id,
        invoiceNumber: invNo,
        supplierGstin: gstin,
        documentType: docType,
        amount: g2bTax,
        reason: 'Missing in Books: Vendor filed in GSTR-2B but no matching purchase voucher recorded in Books; unclaimed candidate',
      });
    }
  }

  const lessDisputedTaxAndValueITC = lessTaxMismatchITC + lessValueMismatchITC;

  // Verification of mathematical balance
  const expectedTotalDeductions =
    lessBlockedSection17_5 +
    lessPendingReviewITC +
    lessDisputedTaxAndValueITC +
    lessMissingIn2BITC +
    lessDuplicateBookVouchersITC;

  // Final Net Candidate Claimable ITC calculation
  // Candidate ITC = Gross Books ITC minus mutually exclusive statutory deductions
  const calculatedCandidateITC = Math.max(0, grossBooksITC - expectedTotalDeductions);

  const bridgeEquationPassed =
    Math.abs(grossBooksITC - expectedTotalDeductions - calculatedCandidateITC) < 0.05;

  return {
    grossBooksITC,
    lessBlockedSection17_5,
    lessPendingReviewITC,
    lessTaxMismatchITC,
    lessValueMismatchITC,
    lessDisputedTaxAndValueITC,
    lessMissingIn2BITC,
    lessDuplicateBookVouchersITC,
    addAcceptedManualMatchesITC,
    finalNetCandidateClaimableITC: calculatedCandidateITC,
    gstr2bITC,
    missingInBooksUnclaimedITC,
    includedRecordIds,
    excludedRecords,
    bridgeEquationPassed,
    auditorCandidateNotice:
      'Candidate ITC is system-calculated based on verified matching records. Final legal eligibility remains subject to statutory audit verification under Section 16(2) and Section 17(5) of the CGST Act.',
  };
}
