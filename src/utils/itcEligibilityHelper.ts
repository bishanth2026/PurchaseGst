import { PurchaseInvoice, LineItem, ITCEligibility } from '../types';

export interface InvoiceItcBreakdown {
  totalITC: number;
  eligibleITC: number;
  blockedITC: number;
  pendingReviewITC: number;
  isMixed: boolean;
  blockedLineItems: { line: LineItem; tax: number; reason: string }[];
  pendingLineItems: { line: LineItem; tax: number; reason: string }[];
  eligibleLineItems: { line: LineItem; tax: number }[];
}

/**
 * Computes line-item-level and invoice-level ITC breakdowns.
 *
 * Rules:
 * 1. If explicit line-item eligibility is provided, each line item is strictly evaluated.
 * 2. Ambiguous line items (itcEligibility: 'PENDING') are NEVER automatically treated as eligible.
 *    They are partitioned into pendingReviewITC for auditor confirmation.
 * 3. Ineligible line items (itcEligibility: 'INELIGIBLE_17_5') are partitioned into blockedITC.
 * 4. Eligible line items (itcEligibility: 'ELIGIBLE') are partitioned into eligibleITC.
 * 5. If line items do not specify per-line eligibility, falls back to invoice.itcEligibility
 *    to preserve 100% backwards compatibility with existing records and synthetic datasets.
 */
export function computeInvoiceItcBreakdown(invoice: PurchaseInvoice): InvoiceItcBreakdown {
  const sign = invoice.documentType === 'CRN' ? -1 : 1;
  const totalTax = (invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount) * sign;

  const hasLineItems = Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0;
  const hasLineItemEligibility = hasLineItems && invoice.lineItems.some((l) => l.itcEligibility !== undefined);

  if (hasLineItemEligibility) {
    let eligibleITC = 0;
    let blockedITC = 0;
    let pendingReviewITC = 0;
    const blockedLineItems: { line: LineItem; tax: number; reason: string }[] = [];
    const pendingLineItems: { line: LineItem; tax: number; reason: string }[] = [];
    const eligibleLineItems: { line: LineItem; tax: number }[] = [];

    for (const line of invoice.lineItems) {
      const lineTax = (line.cgstAmount + line.sgstAmount + line.igstAmount) * sign;

      if (line.itcEligibility === 'INELIGIBLE_17_5') {
        blockedITC += lineTax;
        blockedLineItems.push({
          line,
          tax: lineTax,
          reason: line.blockedReason || 'Section 17(5) Blocked Credit on line item',
        });
      } else if (line.itcEligibility === 'PENDING') {
        pendingReviewITC += lineTax;
        pendingLineItems.push({
          line,
          tax: lineTax,
          reason: line.blockedReason || 'Ambiguous / unverified line item pending auditor review',
        });
      } else if (line.itcEligibility === 'ELIGIBLE') {
        eligibleITC += lineTax;
        eligibleLineItems.push({ line, tax: lineTax });
      } else {
        // Fallback for line items with unspecified eligibility:
        // Inherit from invoice level for compatibility, but do not auto-elevate pending items
        if (invoice.itcEligibility === 'INELIGIBLE_17_5') {
          blockedITC += lineTax;
          blockedLineItems.push({
            line,
            tax: lineTax,
            reason: invoice.notes || 'Inherited invoice-level Section 17(5) blocked status',
          });
        } else if (invoice.itcEligibility === 'PENDING') {
          pendingReviewITC += lineTax;
          pendingLineItems.push({
            line,
            tax: lineTax,
            reason: 'Inherited invoice-level pending review status',
          });
        } else {
          eligibleITC += lineTax;
          eligibleLineItems.push({ line, tax: lineTax });
        }
      }
    }

    const isMixed =
      (blockedITC > 0 && eligibleITC > 0) ||
      (pendingReviewITC > 0 && (eligibleITC > 0 || blockedITC > 0));

    return {
      totalITC: totalTax,
      eligibleITC,
      blockedITC,
      pendingReviewITC,
      isMixed,
      blockedLineItems,
      pendingLineItems,
      eligibleLineItems,
    };
  }

  // Case 2: No line-item-level overrides; use invoice-level itcEligibility (100% legacy/backwards compatible)
  if (invoice.itcEligibility === 'INELIGIBLE_17_5') {
    return {
      totalITC: totalTax,
      eligibleITC: 0,
      blockedITC: totalTax,
      pendingReviewITC: 0,
      isMixed: false,
      blockedLineItems: [],
      pendingLineItems: [],
      eligibleLineItems: [],
    };
  }

  if (invoice.itcEligibility === 'PENDING') {
    return {
      totalITC: totalTax,
      eligibleITC: 0,
      blockedITC: 0,
      pendingReviewITC: totalTax,
      isMixed: false,
      blockedLineItems: [],
      pendingLineItems: [],
      eligibleLineItems: [],
    };
  }

  return {
    totalITC: totalTax,
    eligibleITC: totalTax,
    blockedITC: 0,
    pendingReviewITC: 0,
    isMixed: false,
    blockedLineItems: [],
    pendingLineItems: [],
    eligibleLineItems: [],
  };
}
