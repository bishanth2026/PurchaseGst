import {
  DashboardMetrics,
  GSTR2BRecord,
  PurchaseInvoice,
  ReconciliationItem,
  ReviewStatus,
} from '../types';
import { normalizeInvoiceNumber } from './gstValidation';
import { computeInvoiceItcBreakdown } from './itcEligibilityHelper';

/**
 * Calculates day difference between two YYYY-MM-DD or ISO strings
 */
function getDaysDifference(date1Str: string, date2Str: string): number {
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Checks if two invoice numbers match with reasonable variation
 * (e.g. prefixes, leading zeros, slashes, or hyphens)
 * Strictly avoids false substring matches (e.g. "10" vs "1000")
 */
function areInvoiceNumbersMatching(
  rawBook: string,
  rawCand: string,
  normBook: string,
  normCand: string
): { isMatch: boolean; isExact: boolean; isNormalized: boolean } {
  const exact = rawBook.trim().toUpperCase() === rawCand.trim().toUpperCase();
  if (exact) {
    return { isMatch: true, isExact: true, isNormalized: false };
  }

  if (normBook && normCand && normBook === normCand) {
    return { isMatch: true, isExact: false, isNormalized: true };
  }

  // If both are pure digits and don't match, NEVER match them (e.g. "10" is not "1000")
  const isBookPureDigits = /^\d+$/.test(normBook);
  const isCandPureDigits = /^\d+$/.test(normCand);
  if (isBookPureDigits && isCandPureDigits) {
    return { isMatch: false, isExact: false, isNormalized: false };
  }

  // Check if one has a standard year or series prefix attached to identical core number
  // e.g., "2024-0045" vs "45"
  const extractDigits = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  const digitsBook = extractDigits(rawBook);
  const digitsCand = extractDigits(rawCand);

  if (digitsBook && digitsCand && digitsBook === digitsCand && digitsBook.length >= 2) {
    return { isMatch: true, isExact: false, isNormalized: true };
  }

  return { isMatch: false, isExact: false, isNormalized: false };
}

export function runReconciliation(
  booksInvoices: PurchaseInvoice[],
  gstr2bRecords: GSTR2BRecord[],
  currentPeriod: string,
  existingReconciliations: ReconciliationItem[] = []
): ReconciliationItem[] {
  const results: ReconciliationItem[] = [];
  const matched2BIds = new Set<string>();
  const matchedBookIds = new Set<string>();

  // Map to store existing manual reviews and linkages
  const existingMap = new Map<string, ReconciliationItem>();

  // Step 0: Lock manual linkages and preserve manual decisions
  existingReconciliations.forEach((r) => {
    if (r.invoiceId && r.gstr2bId) {
      existingMap.set(`${r.invoiceId}_${r.gstr2bId}`, r);

      // If this was manually linked, preserve it directly and lock the records
      if (r.matchType === 'MANUAL_MATCH') {
        const book = booksInvoices.find((b) => b.id === r.invoiceId);
        const g2b = gstr2bRecords.find((g) => g.id === r.gstr2bId);
        if (book && g2b) {
          results.push({
            ...r,
            bookInvoice: book,
            gstr2bRecord: g2b,
          });
          matchedBookIds.add(book.id);
          matched2BIds.add(g2b.id);
        }
      }
    }
  });

  // Step 1: Detect duplicate entries in Books (respecting documentType)
  const booksSeen = new Map<string, PurchaseInvoice[]>();
  booksInvoices.forEach((inv) => {
    if (matchedBookIds.has(inv.id)) return;
    const key = `${inv.supplierGstin.trim().toUpperCase()}_${inv.documentType}_${normalizeInvoiceNumber(inv.invoiceNumber)}`;
    const list = booksSeen.get(key) || [];
    list.push(inv);
    booksSeen.set(key, list);
  });

  // Step 2: Detect duplicate entries in GSTR-2B
  const gstr2bSeen = new Map<string, GSTR2BRecord[]>();
  gstr2bRecords.forEach((rec) => {
    const key = `${rec.supplierGstin.trim().toUpperCase()}_${rec.documentType}_${normalizeInvoiceNumber(rec.invoiceNumber)}`;
    const list = gstr2bSeen.get(key) || [];
    list.push(rec);
    gstr2bSeen.set(key, list);
  });

  // Identify duplicate copies in books and mark them
  booksInvoices.forEach((bookInv) => {
    if (matchedBookIds.has(bookInv.id)) return;

    const normBookInvNo = normalizeInvoiceNumber(bookInv.invoiceNumber);
    const supplierGstin = bookInv.supplierGstin.trim().toUpperCase();
    const key = `${supplierGstin}_${bookInv.documentType}_${normBookInvNo}`;
    const sameInBooks = booksSeen.get(key) || [];

    if (sameInBooks.length > 1 && sameInBooks[0].id !== bookInv.id) {
      // This is a duplicate copy
      results.push({
        id: `recon_dup_book_${bookInv.id}`,
        orgId: bookInv.orgId,
        returnPeriod: currentPeriod,
        invoiceId: bookInv.id,
        bookInvoice: bookInv,
        matchType: 'DUPLICATE',
        matchScore: 0,
        matchReason: `Duplicate ${bookInv.documentType} detected in Purchase Register (Duplicate of ${sameInBooks[0].invoiceNumber})`,
        confidenceLevel: 'LOW',
        taxableDiff: 0,
        cgstDiff: 0,
        sgstDiff: 0,
        igstDiff: 0,
        cessDiff: 0,
        totalDiff: 0,
        status: 'PENDING_REVIEW',
        matchingMethod: 'DUPLICATE_PURCHASE_REGISTER_PASS_0',
        dateDifferenceDays: 0,
        manualReviewWarning: `⚠️ DUPLICATE PURCHASE VOUCHER: Duplicate voucher detected in books with identical number '${bookInv.invoiceNumber}' for supplier ${supplierGstin}. Resolve duplicate to prevent double ITC claim.`,
        supportingEvidence: [
          `Duplicate voucher ID: ${bookInv.id}`,
          `Primary voucher ID: ${sameInBooks[0].id}`,
          `Supplier GSTIN: ${supplierGstin}`,
          `Invoice number: ${bookInv.invoiceNumber}`,
        ],
        itcEligibilityCategory: 'INELIGIBLE_MISMATCH',
        suggestedAction: 'Void or remove duplicate voucher from purchase register to prevent double ITC claim.',
      });
      matchedBookIds.add(bookInv.id);
    }
  });

  // Step 3: Multi-Pass Reconciliation Matching for active Book Invoices
  booksInvoices.forEach((bookInv) => {
    if (matchedBookIds.has(bookInv.id)) return;

    const normBookInvNo = normalizeInvoiceNumber(bookInv.invoiceNumber);
    const supplierGstin = bookInv.supplierGstin.trim().toUpperCase();

    // Eligible candidates from GSTR-2B with matching supplier GSTIN
    const candidates = gstr2bRecords.filter(
      (r) => !matched2BIds.has(r.id) && r.supplierGstin.trim().toUpperCase() === supplierGstin
    );

    let bestCandidate: {
      cand: GSTR2BRecord;
      matchType: ReconciliationItem['matchType'];
      score: number;
      reason: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      taxableDiff: number;
      cgstDiff: number;
      sgstDiff: number;
      igstDiff: number;
      cessDiff: number;
      totalDiff: number;
      matchingMethod?: string;
      dateDifferenceDays?: number;
      manualReviewWarning?: string;
      supportingEvidence?: string[];
      itcEligibilityCategory?: ReconciliationItem['itcEligibilityCategory'];
    } | null = null;

    // PASS 1: Search for Exact Match (Supplier GSTIN, Normalized Inv No, Doc Type, Taxable & Taxes within ₹2, Date within 30 days)
    for (const cand of candidates) {
      const normCandInvNo = normalizeInvoiceNumber(cand.invoiceNumber);
      const invCheck = areInvoiceNumbersMatching(
        bookInv.invoiceNumber,
        cand.invoiceNumber,
        normBookInvNo,
        normCandInvNo
      );

      if (!invCheck.isMatch) continue;

      const daysDiff = getDaysDifference(bookInv.invoiceDate, cand.invoiceDate);
      const isDocTypeMatch = cand.documentType === bookInv.documentType;
      const taxableDiff = cand.taxableValue - bookInv.taxableValue;
      const cgstDiff = cand.cgstAmount - bookInv.cgstAmount;
      const sgstDiff = cand.sgstAmount - bookInv.sgstAmount;
      const igstDiff = cand.igstAmount - bookInv.igstAmount;
      const cessDiff = cand.cessAmount - bookInv.cessAmount;
      const totalDiff = cand.invoiceValue - bookInv.totalAmount;
      const taxTotalDiff = Math.abs(cgstDiff) + Math.abs(sgstDiff) + Math.abs(igstDiff) + Math.abs(cessDiff);

      // Exact match criteria: same doc type, taxable diff <= 2, tax diff <= 2, days diff <= 30
      if (isDocTypeMatch && Math.abs(taxableDiff) <= 2.0 && taxTotalDiff <= 2.0 && daysDiff <= 30) {
        bestCandidate = {
          cand,
          matchType: 'EXACT',
          score: 100,
          reason: invCheck.isExact
            ? `Exact match on GSTIN, ${bookInv.documentType} No (${cand.invoiceNumber}), Date (${daysDiff}d diff), Taxable & Tax amounts.`
            : `Exact match on GSTIN & Tax amounts; normalized number match ('${bookInv.invoiceNumber}' vs '${cand.invoiceNumber}').`,
          confidence: 'HIGH',
          taxableDiff,
          cgstDiff,
          sgstDiff,
          igstDiff,
          cessDiff,
          totalDiff,
          matchingMethod: invCheck.isExact ? 'EXACT_CANONICAL' : 'EXACT_NORMALIZED_INVOICE_NUMBER',
          dateDifferenceDays: daysDiff,
          manualReviewWarning: undefined,
          supportingEvidence: [
            `Supplier GSTIN verified: ${cand.supplierGstin}`,
            `Invoice number alignment: '${bookInv.invoiceNumber}' corresponds to '${cand.invoiceNumber}'`,
            `Document type confirmed: ${bookInv.documentType}`,
            `Taxable value equality: Books ₹${bookInv.taxableValue.toFixed(2)} == 2B ₹${cand.taxableValue.toFixed(2)}`,
            `Tax amounts equality: Books ₹${(bookInv.cgstAmount + bookInv.sgstAmount + bookInv.igstAmount).toFixed(2)} == 2B ₹${(cand.cgstAmount + cand.sgstAmount + cand.igstAmount).toFixed(2)}`,
            `Statutory date window compliant: ${daysDiff} days difference (<= 30 days)`,
          ],
          itcEligibilityCategory:
            bookInv.itcEligibility === 'INELIGIBLE_17_5'
              ? 'BLOCKED_SECTION_17_5'
              : 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5',
        };
        break; // Found perfect match
      }
    }

    // PASS 2: If no exact match, check for Doc Type Mismatch or Tax/Value Discrepancy with same invoice number
    if (!bestCandidate) {
      for (const cand of candidates) {
        const normCandInvNo = normalizeInvoiceNumber(cand.invoiceNumber);
        const invCheck = areInvoiceNumbersMatching(
          bookInv.invoiceNumber,
          cand.invoiceNumber,
          normBookInvNo,
          normCandInvNo
        );

        if (!invCheck.isMatch) continue;

        const daysDiff = getDaysDifference(bookInv.invoiceDate, cand.invoiceDate);
        const isDocTypeMatch = cand.documentType === bookInv.documentType;
        const taxableDiff = cand.taxableValue - bookInv.taxableValue;
        const cgstDiff = cand.cgstAmount - bookInv.cgstAmount;
        const sgstDiff = cand.sgstAmount - bookInv.sgstAmount;
        const igstDiff = cand.igstAmount - bookInv.igstAmount;
        const cessDiff = cand.cessAmount - bookInv.cessAmount;
        const totalDiff = cand.invoiceValue - bookInv.totalAmount;
        const taxTotalDiff = Math.abs(cgstDiff) + Math.abs(sgstDiff) + Math.abs(igstDiff) + Math.abs(cessDiff);

        // Subcase A: Document type mismatch (e.g. CRN recorded as INV or vice-versa)
        if (!isDocTypeMatch) {
          bestCandidate = {
            cand,
            matchType: 'CRN_DBN_DIFF',
            score: 65,
            reason: `Document type dispute: Book has '${bookInv.documentType}', but GSTR-2B reports '${cand.documentType}'.`,
            confidence: 'MEDIUM',
            taxableDiff,
            cgstDiff,
            sgstDiff,
            igstDiff,
            cessDiff,
            totalDiff,
            matchingMethod: 'CRN_DBN_DOC_TYPE_DISPUTE',
            dateDifferenceDays: daysDiff,
            manualReviewWarning: `⚠️ DOCUMENT TYPE POLARITY DISPUTE: Books record as ${bookInv.documentType}, while GSTR-2B reflects ${cand.documentType}. Reverse/credit polarity must be reconciled before ITC filing.`,
            supportingEvidence: [
              `Supplier GSTIN: ${cand.supplierGstin}`,
              `Invoice number matched: ${cand.invoiceNumber}`,
              `Book document type: ${bookInv.documentType}`,
              `GSTR-2B document type: ${cand.documentType}`,
            ],
            itcEligibilityCategory: 'INELIGIBLE_MISMATCH',
          };
          break;
        }

        // Subcase B: Tax or Value mismatch (invoice numbers match, but amounts differ > ₹2.00)
        if (Math.abs(taxableDiff) > 2.0 || taxTotalDiff > 2.0) {
          const isTaxRateOnly = Math.abs(taxableDiff) <= 2.0 && taxTotalDiff > 2.0;
          const matchType = isTaxRateOnly ? 'MISMATCH_TAX' : 'MISMATCH_VALUE';
          const reason = isTaxRateOnly
            ? `Tax rate/breakdown mismatch of ₹${taxTotalDiff.toFixed(2)} (Taxable matches at ₹${bookInv.taxableValue.toFixed(2)}, but CGST/SGST/IGST differs).`
            : `Taxable value variance of ₹${Math.abs(taxableDiff).toFixed(2)} (Books: ₹${bookInv.taxableValue.toFixed(2)}, 2B: ₹${cand.taxableValue.toFixed(2)}).`;

          const warningMsg = isTaxRateOnly
            ? `⚠️ TAX BREAKDOWN VARIANCE: Tax breakdown difference of ₹${taxTotalDiff.toFixed(2)} (Books ₹${(bookInv.cgstAmount + bookInv.sgstAmount + bookInv.igstAmount).toFixed(2)} vs 2B ₹${(cand.cgstAmount + cand.sgstAmount + cand.igstAmount).toFixed(2)}). Request vendor amendment in Table 9A.`
            : `⚠️ TAXABLE VALUE VARIANCE: Taxable value differs by ₹${Math.abs(taxableDiff).toFixed(2)} (Books: ₹${bookInv.taxableValue.toFixed(2)} vs 2B: ₹${cand.taxableValue.toFixed(2)}). Tax credit cannot be claimed in excess of 2B under Section 16(2)(aa).`;

          bestCandidate = {
            cand,
            matchType,
            score: 75,
            reason,
            confidence: 'MEDIUM',
            taxableDiff,
            cgstDiff,
            sgstDiff,
            igstDiff,
            cessDiff,
            totalDiff,
            matchingMethod: isTaxRateOnly ? 'MISMATCH_TAX_RATE' : 'MISMATCH_TAXABLE_VALUE',
            dateDifferenceDays: daysDiff,
            manualReviewWarning: warningMsg,
            supportingEvidence: [
              `Supplier GSTIN: ${cand.supplierGstin}`,
              `Invoice number matched: ${cand.invoiceNumber}`,
              `Document type matched: ${cand.documentType}`,
              `Taxable difference: ₹${taxableDiff.toFixed(2)} (Books: ₹${bookInv.taxableValue.toFixed(2)}, 2B: ₹${cand.taxableValue.toFixed(2)})`,
              `Tax breakdown difference: ₹${taxTotalDiff.toFixed(2)}`,
            ],
            itcEligibilityCategory: 'INELIGIBLE_MISMATCH',
          };
          break;
        }
      }
    }

    // PASS 3: Probable Matches - Only when strong supporting evidence is present
    // For date differences > 30 days: requires exact supplier GSTIN, normalized invoice number, doc type,
    // and financial amounts agreement (taxable diff <= 2.0 and tax diff <= 2.0).
    // If dates differ by > 30 days AND amounts differ, they are NOT matched as probable!
    if (!bestCandidate) {
      for (const cand of candidates) {
        const normCandInvNo = normalizeInvoiceNumber(cand.invoiceNumber);
        const invCheck = areInvoiceNumbersMatching(
          bookInv.invoiceNumber,
          cand.invoiceNumber,
          normBookInvNo,
          normCandInvNo
        );

        if (!invCheck.isMatch) continue;

        const isDocTypeMatch = cand.documentType === bookInv.documentType;
        if (!isDocTypeMatch) continue;

        const daysDiff = getDaysDifference(bookInv.invoiceDate, cand.invoiceDate);
        const taxableDiff = cand.taxableValue - bookInv.taxableValue;
        const cgstDiff = cand.cgstAmount - bookInv.cgstAmount;
        const sgstDiff = cand.sgstAmount - bookInv.sgstAmount;
        const igstDiff = cand.igstAmount - bookInv.igstAmount;
        const cessDiff = cand.cessAmount - bookInv.cessAmount;
        const totalDiff = cand.invoiceValue - bookInv.totalAmount;
        const taxTotalDiff = Math.abs(cgstDiff) + Math.abs(sgstDiff) + Math.abs(igstDiff) + Math.abs(cessDiff);

        // Strong supporting evidence criteria:
        // 1. Supplier GSTIN matches (guaranteed by candidates filter)
        // 2. Normalized invoice number matches
        // 3. Document type matches
        // 4. Taxable value matches within ₹2.00
        // 5. Tax amounts match within ₹2.00
        const hasStrongFinancialEvidence = Math.abs(taxableDiff) <= 2.0 && taxTotalDiff <= 2.0;

        if (!hasStrongFinancialEvidence) {
          // Cannot match as probable without strong financial alignment when dates differ
          continue;
        }

        let score = 85;
        const reasons: string[] = [];

        if (daysDiff > 30) {
          score -= 15;
          reasons.push(
            `Invoice date variation of ${daysDiff} days (${bookInv.invoiceDate} in Books vs ${cand.invoiceDate} in 2B)`
          );
        }

        if (!invCheck.isExact) {
          reasons.push(`Invoice number variation ('${bookInv.invoiceNumber}' vs '${cand.invoiceNumber}')`);
        }

        const manualReviewWarning =
          daysDiff > 30
            ? `⚠️ MANUAL REVIEW REQUIRED: Date variance of ${daysDiff} days exceeds 30-day statutory threshold (Books: ${bookInv.invoiceDate} vs 2B: ${cand.invoiceDate}). Strong supporting evidence verified: Supplier GSTIN, normalized invoice number (${bookInv.invoiceNumber} ↔ ${cand.invoiceNumber}), document type (${bookInv.documentType}), and full tax amounts match within ₹${taxTotalDiff.toFixed(2)}. Manual auditor review required before claiming ITC under Section 16(4).`
            : undefined;

        bestCandidate = {
          cand,
          matchType: 'PROBABLE',
          score,
          reason: reasons.join('; ') || 'Probable match with verified financial evidence.',
          confidence: 'MEDIUM',
          taxableDiff,
          cgstDiff,
          sgstDiff,
          igstDiff,
          cessDiff,
          totalDiff,
          matchingMethod:
            daysDiff > 30 ? 'PROBABLE_DATE_VARIANCE_OVER_30_DAYS' : 'PROBABLE_NORMALIZED_ATTRIBUTES',
          dateDifferenceDays: daysDiff,
          manualReviewWarning,
          supportingEvidence: [
            `Supplier GSTIN verified: ${cand.supplierGstin}`,
            `Normalized invoice number match: '${bookInv.invoiceNumber}' ↔ '${cand.invoiceNumber}' (core: '${normBookInvNo}')`,
            `Document type match: ${bookInv.documentType}`,
            `Taxable value equality: Books ₹${bookInv.taxableValue.toFixed(2)} == 2B ₹${cand.taxableValue.toFixed(2)} (diff: ₹${taxableDiff.toFixed(2)})`,
            `Tax amounts equality: Books ₹${(bookInv.cgstAmount + bookInv.sgstAmount + bookInv.igstAmount).toFixed(2)} == 2B ₹${(cand.cgstAmount + cand.sgstAmount + cand.igstAmount).toFixed(2)}`,
            `⚠️ Date disparity: ${daysDiff} days between Books (${bookInv.invoiceDate}) and GSTR-2B (${cand.invoiceDate})`,
          ],
          itcEligibilityCategory: 'PENDING_AUDITOR_REVIEW',
        };
        break;
      }
    }

    // Process reconciliation outcome for this Book Invoice
    if (bestCandidate) {
      matched2BIds.add(bestCandidate.cand.id);
      matchedBookIds.add(bookInv.id);

      const existing = existingMap.get(`${bookInv.id}_${bestCandidate.cand.id}`);
      const status: ReviewStatus = existing
        ? existing.status
        : bestCandidate.matchType === 'EXACT'
        ? 'ACCEPTED'
        : 'PENDING_REVIEW';

      results.push({
        id: existing?.id || `recon_${bookInv.id}_${bestCandidate.cand.id}`,
        orgId: bookInv.orgId,
        returnPeriod: currentPeriod,
        invoiceId: bookInv.id,
        gstr2bId: bestCandidate.cand.id,
        bookInvoice: bookInv,
        gstr2bRecord: bestCandidate.cand,
        matchType: bestCandidate.matchType,
        matchScore: bestCandidate.score,
        matchReason: bestCandidate.reason,
        confidenceLevel: bestCandidate.confidence,
        taxableDiff: bestCandidate.taxableDiff,
        cgstDiff: bestCandidate.cgstDiff,
        sgstDiff: bestCandidate.sgstDiff,
        igstDiff: bestCandidate.igstDiff,
        cessDiff: bestCandidate.cessDiff,
        totalDiff: bestCandidate.totalDiff,
        status,
        userComments: existing?.userComments,
        reviewedBy: existing?.reviewedBy,
        reviewedAt: existing?.reviewedAt,
        matchingMethod: bestCandidate.matchingMethod,
        dateDifferenceDays: bestCandidate.dateDifferenceDays,
        manualReviewWarning: bestCandidate.manualReviewWarning,
        supportingEvidence: bestCandidate.supportingEvidence,
        itcEligibilityCategory: bestCandidate.itcEligibilityCategory,
        suggestedAction:
          bestCandidate.matchType === 'EXACT'
            ? bookInv.itcEligibility === 'INELIGIBLE_17_5'
              ? 'Blocked ITC under Section 17(5). Must be reported as reversed/ineligible in Table 4(B)(1) of GSTR-3B.'
              : 'Reconciled with GSTR-2B Table 4(A)(5). Reconciled ITC is provisionally matched; statutory eligibility remains subject to Section 17(5) checks and vendor 180-day payment compliance before GSTR-3B filing.'
            : bestCandidate.matchType === 'MISMATCH_TAX' || bestCandidate.matchType === 'MISMATCH_VALUE'
            ? 'Request vendor to file amendment in GSTR-1 Table 9A.'
            : bestCandidate.matchType === 'CRN_DBN_DIFF'
            ? 'Confirm document polarity before claiming ITC.'
            : 'Auditor manual review required before claiming ITC under Section 16(4).',
      });
    } else {
      // Record not found in GSTR-2B -> MISSING_IN_2B
      matchedBookIds.add(bookInv.id);
      results.push({
        id: `recon_missing_2b_${bookInv.id}`,
        orgId: bookInv.orgId,
        returnPeriod: currentPeriod,
        invoiceId: bookInv.id,
        bookInvoice: bookInv,
        matchType: 'MISSING_IN_2B',
        matchScore: 0,
        matchReason: 'Recorded in Purchase Register, but vendor has NOT uploaded into GSTR-1 / missing in GSTR-2B.',
        confidenceLevel: 'LOW',
        taxableDiff: -bookInv.taxableValue,
        cgstDiff: -bookInv.cgstAmount,
        sgstDiff: -bookInv.sgstAmount,
        igstDiff: -bookInv.igstAmount,
        cessDiff: -bookInv.cessAmount,
        totalDiff: -bookInv.totalAmount,
        status: 'PENDING_REVIEW',
        matchingMethod: 'UNMATCHED_BOOKS_ABSENT_IN_2B',
        manualReviewWarning: '⚠️ MISSING IN GSTR-2B: Supplier has not reported invoice in GSTR-1. Ineligible for ITC under Section 16(2)(aa).',
        supportingEvidence: [
          `Invoice recorded in Books: ${bookInv.invoiceNumber}`,
          `Supplier GSTIN: ${bookInv.supplierGstin}`,
          `Status: Not found in any GSTR-2B statement filed for this tax period`,
        ],
        itcEligibilityCategory: 'INELIGIBLE_MISMATCH',
        suggestedAction: 'Follow up with vendor to file GSTR-1 before Section 16(4) statutory deadline.',
      });
    }
  });

  // Step 4: Check remaining GSTR-2B records
  gstr2bRecords.forEach((cand) => {
    if (matched2BIds.has(cand.id)) return;

    const normCandInvNo = normalizeInvoiceNumber(cand.invoiceNumber);
    const supplierGstin = cand.supplierGstin.trim().toUpperCase();
    const key = `${supplierGstin}_${cand.documentType}_${normCandInvNo}`;
    const sameIn2B = gstr2bSeen.get(key) || [];

    // If there were multiple identical records in 2B and the first was already matched or processed
    if (sameIn2B.length > 1 && sameIn2B[0].id !== cand.id) {
      results.push({
        id: `recon_dup_2b_${cand.id}`,
        orgId: cand.orgId,
        returnPeriod: currentPeriod,
        gstr2bId: cand.id,
        gstr2bRecord: cand,
        matchType: 'DUPLICATE',
        matchScore: 0,
        matchReason: `Duplicate ${cand.documentType} filed by vendor in GSTR-1 / GSTR-2B (Duplicate of ${sameIn2B[0].invoiceNumber})`,
        confidenceLevel: 'LOW',
        taxableDiff: cand.taxableValue,
        cgstDiff: cand.cgstAmount,
        sgstDiff: cand.sgstAmount,
        igstDiff: cand.igstAmount,
        cessDiff: cand.cessAmount,
        totalDiff: cand.invoiceValue,
        status: 'PENDING_REVIEW',
        matchingMethod: 'DUPLICATE_VENDOR_FILING_GSTR2B',
        dateDifferenceDays: 0,
        manualReviewWarning: `⚠️ DUPLICATE SUPPLIER FILING: Supplier uploaded identical invoice ${cand.invoiceNumber} multiple times into GSTR-1. Do not double book.`,
        supportingEvidence: [
          `Duplicate GSTR-2B ID: ${cand.id}`,
          `Primary GSTR-2B ID: ${sameIn2B[0].id}`,
          `Supplier GSTIN: ${supplierGstin}`,
          `Invoice Number: ${cand.invoiceNumber}`,
        ],
        itcEligibilityCategory: 'INELIGIBLE_MISMATCH',
        suggestedAction: 'Supplier filed duplicate entry in GSTR-1. Do not book twice in Purchase Register.',
      });
      matched2BIds.add(cand.id);
      return;
    }

    // Otherwise, this is a genuine Missing in Books (Unclaimed ITC opportunity)
    matched2BIds.add(cand.id);
    results.push({
      id: `recon_missing_books_${cand.id}`,
      orgId: cand.orgId,
      returnPeriod: currentPeriod,
      gstr2bId: cand.id,
      gstr2bRecord: cand,
      matchType: 'MISSING_IN_BOOKS',
      matchScore: 0,
      matchReason: 'Valid tax invoice reported by supplier in GSTR-2B, but absent from Purchase Register.',
      confidenceLevel: 'LOW',
      taxableDiff: cand.taxableValue,
      cgstDiff: cand.cgstAmount,
      sgstDiff: cand.sgstAmount,
      igstDiff: cand.igstAmount,
      cessDiff: cand.cessAmount,
      totalDiff: cand.invoiceValue,
      status: 'PENDING_REVIEW',
      matchingMethod: 'UNMATCHED_2B_ABSENT_IN_BOOKS',
      manualReviewWarning: '⚠️ UNCLAIMED ITC OPPORTUNITY: Legitimate supplier invoice found in GSTR-2B, but voucher is missing from purchase register.',
      supportingEvidence: [
        `GSTR-2B Invoice Number: ${cand.invoiceNumber}`,
        `Supplier GSTIN: ${cand.supplierGstin}`,
        `Available ITC on Portal: ₹${(cand.cgstAmount + cand.sgstAmount + cand.igstAmount).toFixed(2)}`,
        `GSTR-1 Status: ${cand.gstr1FilingStatus || 'FILED'}`,
      ],
      itcEligibilityCategory: 'PENDING_AUDITOR_REVIEW',
      suggestedAction: 'Verify physical goods receipt and book invoice in accounting register to claim ITC.',
    });
  });

  return results;
}

export function computeDashboardMetrics(
  booksInvoices: PurchaseInvoice[],
  gstr2bRecords: GSTR2BRecord[],
  reconciliations: ReconciliationItem[]
): DashboardMetrics {
  let totalBooksTaxable = 0;
  let totalBooksCGST = 0;
  let totalBooksSGST = 0;
  let totalBooksIGST = 0;
  let totalBooksITC = 0;
  let totalBooksCess = 0;
  let eligibleITC = 0;
  let ineligibleITC = 0;

  // Compute Books Totals with verified polarity for Credit Notes
  booksInvoices.forEach((inv) => {
    const sign = inv.documentType === 'CRN' ? -1 : 1;
    const cgst = inv.cgstAmount * sign;
    const sgst = inv.sgstAmount * sign;
    const igst = inv.igstAmount * sign;
    const itc = (inv.cgstAmount + inv.sgstAmount + inv.igstAmount) * sign;

    totalBooksTaxable += inv.taxableValue * sign;
    totalBooksCGST += cgst;
    totalBooksSGST += sgst;
    totalBooksIGST += igst;
    totalBooksITC += itc;
    totalBooksCess += inv.cessAmount * sign;

    const breakdown = computeInvoiceItcBreakdown(inv);
    ineligibleITC += breakdown.blockedITC;
    eligibleITC += breakdown.eligibleITC;
  });

  let total2BTaxable = 0;
  let total2BCGST = 0;
  let total2BSGST = 0;
  let total2BIGST = 0;
  let total2BITC = 0;

  // Compute GSTR-2B Totals with verified polarity for Credit Notes
  gstr2bRecords.forEach((rec) => {
    const sign = rec.documentType === 'CRN' ? -1 : 1;
    const cgst = rec.cgstAmount * sign;
    const sgst = rec.sgstAmount * sign;
    const igst = rec.igstAmount * sign;
    total2BTaxable += rec.taxableValue * sign;
    total2BCGST += cgst;
    total2BSGST += sgst;
    total2BIGST += igst;
    total2BITC += (rec.cgstAmount + rec.sgstAmount + rec.igstAmount) * sign;
  });

  let matchedTaxable = 0;
  let matchedCGST = 0;
  let matchedSGST = 0;
  let matchedIGST = 0;
  let matchedITC = 0;
  let matchedCount = 0;

  let probableTaxable = 0;
  let probableCGST = 0;
  let probableSGST = 0;
  let probableIGST = 0;
  let probableITC = 0;
  let probableCount = 0;

  let mismatchTaxable = 0;
  let mismatchCGST = 0;
  let mismatchSGST = 0;
  let mismatchIGST = 0;
  let mismatchITC = 0;
  let mismatchCount = 0;

  let missingIn2BTaxable = 0;
  let missingIn2BCGST = 0;
  let missingIn2BSGST = 0;
  let missingIn2BIGST = 0;
  let missingIn2BITC = 0;
  let missingIn2BCount = 0;

  let missingInBooksTaxable = 0;
  let missingInBooksCGST = 0;
  let missingInBooksSGST = 0;
  let missingInBooksIGST = 0;
  let missingInBooksITC = 0;
  let missingInBooksCount = 0;

  let duplicateTaxable = 0;
  let duplicateCGST = 0;
  let duplicateSGST = 0;
  let duplicateIGST = 0;
  let duplicateITC = 0;
  let duplicateCount = 0;

  let unresolvedCount = 0;
  let matchedIneligibleITC = 0;

  reconciliations.forEach((r) => {
    if (r.status === 'PENDING_REVIEW' || r.status === 'REJECTED') {
      unresolvedCount++;
    }

    const bookSign = r.bookInvoice?.documentType === 'CRN' ? -1 : 1;
    const g2bSign = r.gstr2bRecord?.documentType === 'CRN' ? -1 : 1;

    switch (r.matchType) {
      case 'EXACT':
      case 'MANUAL_MATCH': {
        // Exclude rejected items from claimable matched ITC
        if (r.status !== 'REJECTED') {
          const taxable = r.bookInvoice
            ? r.bookInvoice.taxableValue * bookSign
            : r.gstr2bRecord
            ? r.gstr2bRecord.taxableValue * g2bSign
            : 0;
          const cgst = r.bookInvoice
            ? r.bookInvoice.cgstAmount * bookSign
            : r.gstr2bRecord
            ? r.gstr2bRecord.cgstAmount * g2bSign
            : 0;
          const sgst = r.bookInvoice
            ? r.bookInvoice.sgstAmount * bookSign
            : r.gstr2bRecord
            ? r.gstr2bRecord.sgstAmount * g2bSign
            : 0;
          const igst = r.bookInvoice
            ? r.bookInvoice.igstAmount * bookSign
            : r.gstr2bRecord
            ? r.gstr2bRecord.igstAmount * g2bSign
            : 0;
          const itc = cgst + sgst + igst;

          matchedTaxable += taxable;
          matchedCGST += cgst;
          matchedSGST += sgst;
          matchedIGST += igst;
          matchedITC += itc;
          matchedCount++;

          if (r.bookInvoice) {
            const breakdown = computeInvoiceItcBreakdown(r.bookInvoice);
            matchedIneligibleITC += (breakdown.blockedITC + breakdown.pendingReviewITC);
          }
        }
        break;
      }
      case 'PROBABLE': {
        const taxable = r.bookInvoice
          ? r.bookInvoice.taxableValue * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.taxableValue * g2bSign
          : 0;
        const cgst = r.bookInvoice
          ? r.bookInvoice.cgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.cgstAmount * g2bSign
          : 0;
        const sgst = r.bookInvoice
          ? r.bookInvoice.sgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.sgstAmount * g2bSign
          : 0;
        const igst = r.bookInvoice
          ? r.bookInvoice.igstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.igstAmount * g2bSign
          : 0;
        const itc = cgst + sgst + igst;

        if (r.status === 'ACCEPTED') {
          // Accepted probable matches promote to matched ITC
          matchedTaxable += taxable;
          matchedCGST += cgst;
          matchedSGST += sgst;
          matchedIGST += igst;
          matchedITC += itc;
          matchedCount++;
          if (r.bookInvoice) {
            const breakdown = computeInvoiceItcBreakdown(r.bookInvoice);
            matchedIneligibleITC += (breakdown.blockedITC + breakdown.pendingReviewITC);
          }
        } else if (r.status !== 'REJECTED') {
          probableTaxable += taxable;
          probableCGST += cgst;
          probableSGST += sgst;
          probableIGST += igst;
          probableITC += itc;
          probableCount++;
        }
        break;
      }
      case 'MISMATCH_VALUE':
      case 'MISMATCH_TAX':
      case 'CRN_DBN_DIFF': {
        const taxable = r.bookInvoice
          ? r.bookInvoice.taxableValue * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.taxableValue * g2bSign
          : 0;
        const cgst = r.bookInvoice
          ? r.bookInvoice.cgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.cgstAmount * g2bSign
          : 0;
        const sgst = r.bookInvoice
          ? r.bookInvoice.sgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.sgstAmount * g2bSign
          : 0;
        const igst = r.bookInvoice
          ? r.bookInvoice.igstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.igstAmount * g2bSign
          : 0;
        const itc = cgst + sgst + igst;

        mismatchTaxable += taxable;
        mismatchCGST += cgst;
        mismatchSGST += sgst;
        mismatchIGST += igst;
        mismatchITC += itc;
        mismatchCount++;
        break;
      }
      case 'MISSING_IN_2B': {
        const taxable = r.bookInvoice ? r.bookInvoice.taxableValue * bookSign : 0;
        const cgst = r.bookInvoice ? r.bookInvoice.cgstAmount * bookSign : 0;
        const sgst = r.bookInvoice ? r.bookInvoice.sgstAmount * bookSign : 0;
        const igst = r.bookInvoice ? r.bookInvoice.igstAmount * bookSign : 0;
        const itc = cgst + sgst + igst;

        missingIn2BTaxable += taxable;
        missingIn2BCGST += cgst;
        missingIn2BSGST += sgst;
        missingIn2BIGST += igst;
        missingIn2BITC += itc;
        missingIn2BCount++;
        break;
      }
      case 'MISSING_IN_BOOKS': {
        const taxable = r.gstr2bRecord ? r.gstr2bRecord.taxableValue * g2bSign : 0;
        const cgst = r.gstr2bRecord ? r.gstr2bRecord.cgstAmount * g2bSign : 0;
        const sgst = r.gstr2bRecord ? r.gstr2bRecord.sgstAmount * g2bSign : 0;
        const igst = r.gstr2bRecord ? r.gstr2bRecord.igstAmount * g2bSign : 0;
        const itc = cgst + sgst + igst;

        missingInBooksTaxable += taxable;
        missingInBooksCGST += cgst;
        missingInBooksSGST += sgst;
        missingInBooksIGST += igst;
        missingInBooksITC += itc;
        missingInBooksCount++;
        break;
      }
      case 'DUPLICATE': {
        const taxable = r.bookInvoice
          ? r.bookInvoice.taxableValue * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.taxableValue * g2bSign
          : 0;
        const cgst = r.bookInvoice
          ? r.bookInvoice.cgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.cgstAmount * g2bSign
          : 0;
        const sgst = r.bookInvoice
          ? r.bookInvoice.sgstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.sgstAmount * g2bSign
          : 0;
        const igst = r.bookInvoice
          ? r.bookInvoice.igstAmount * bookSign
          : r.gstr2bRecord
          ? r.gstr2bRecord.igstAmount * g2bSign
          : 0;
        const itc = cgst + sgst + igst;

        duplicateTaxable += taxable;
        duplicateCGST += cgst;
        duplicateSGST += sgst;
        duplicateIGST += igst;
        duplicateITC += itc;
        duplicateCount++;
        break;
      }
    }
  });

  // Net claimable ITC strictly includes accepted matched ITC minus blocked Section 17(5) items
  const netClaimableITC = Math.max(0, matchedITC - matchedIneligibleITC);

  return {
    totalBooksInvoices: booksInvoices.length,
    totalBooksTaxable,
    totalBooksCGST,
    totalBooksSGST,
    totalBooksIGST,
    totalBooksITC,
    totalBooksCess,

    total2BRecords: gstr2bRecords.length,
    total2BTaxable,
    total2BCGST,
    total2BSGST,
    total2BIGST,
    total2BITC,

    matchedTaxable,
    matchedCGST,
    matchedSGST,
    matchedIGST,
    matchedITC,
    matchedCount,

    probableTaxable,
    probableCGST,
    probableSGST,
    probableIGST,
    probableITC,
    probableCount,

    mismatchTaxable,
    mismatchCGST,
    mismatchSGST,
    mismatchIGST,
    mismatchITC,
    mismatchCount,

    missingIn2BTaxable,
    missingIn2BCGST,
    missingIn2BSGST,
    missingIn2BIGST,
    missingIn2BITC,
    missingIn2BCount,

    missingInBooksTaxable,
    missingInBooksCGST,
    missingInBooksSGST,
    missingInBooksIGST,
    missingInBooksITC,
    missingInBooksCount,

    duplicateTaxable,
    duplicateCGST,
    duplicateSGST,
    duplicateIGST,
    duplicateITC,
    duplicateCount,

    unresolvedCount,
    eligibleITC,
    ineligibleITC,
    netClaimableITC,
  };
}
