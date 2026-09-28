import { extractInvoiceDataFromFile, OCRExtractionResult } from '../services/geminiOcrService';
import { PurchaseInvoice } from '../types';
import { normalizeInvoiceNumber, validatePurchaseInvoice } from '../utils/gstValidation';
import { computeInvoiceItcBreakdown } from '../utils/itcEligibilityHelper';
import { AgentToolResult, InvoiceAgentContext } from './agentTypes';

const timed = async <T>(tool: string, fn: () => Promise<T>): Promise<AgentToolResult<T>> => {
  const started = performance.now();
  try {
    const data = await fn();
    return { tool, success: true, data, warnings: [], errors: [], durationMs: Math.round(performance.now() - started) };
  } catch (error: any) {
    return { tool, success: false, warnings: [], errors: [error?.message || String(error)], durationMs: Math.round(performance.now() - started) };
  }
};

export const agentTools = {
  extractInvoice: (file: File, ctx: InvoiceAgentContext) =>
    timed<OCRExtractionResult>('extract_invoice', () => extractInvoiceDataFromFile(file, ctx.buyerGstin, ctx.orgId)),

  validateInvoice: async (invoice: Partial<PurchaseInvoice>, ctx: InvoiceAgentContext) =>
    timed('validate_invoice', async () => validatePurchaseInvoice(invoice, ctx.buyerGstin, ctx.existingInvoices)),

  checkDuplicateInvoice: async (invoice: Partial<PurchaseInvoice>, ctx: InvoiceAgentContext) =>
    timed('check_duplicate_invoice', async () => {
      if (!invoice.supplierGstin || !invoice.invoiceNumber) return { isDuplicate: false };
      const normalized = normalizeInvoiceNumber(invoice.invoiceNumber);
      const duplicate = ctx.existingInvoices.find((existing) =>
        existing.supplierGstin.trim().toUpperCase() === invoice.supplierGstin!.trim().toUpperCase() &&
        (normalizeInvoiceNumber(existing.invoiceNumber) === normalized ||
          existing.invoiceNumber.trim().toUpperCase() === invoice.invoiceNumber!.trim().toUpperCase())
      );
      return { isDuplicate: Boolean(duplicate), duplicateInvoiceId: duplicate?.id, duplicateInvoiceNumber: duplicate?.invoiceNumber };
    }),

  checkItcEligibility: async (invoice: Partial<PurchaseInvoice>) =>
    timed('check_itc_eligibility', async () => {
      const full = invoice as PurchaseInvoice;
      const breakdown = computeInvoiceItcBreakdown(full);
      return {
        eligibility: full.itcEligibility,
        eligibleITC: breakdown.eligibleITC,
        blockedITC: breakdown.blockedITC,
        pendingReviewITC: breakdown.pendingReviewITC,
        reasons: [
          ...breakdown.blockedLineItems.map((x) => x.reason),
          ...breakdown.pendingLineItems.map((x) => x.reason),
        ],
      };
    }),
};

export type AgentToolSet = typeof agentTools;
