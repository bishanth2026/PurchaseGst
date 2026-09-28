import { FieldConfidences, PurchaseInvoice, ReconciliationItem } from '../types';

export type AgentDecision = 'PROCESS' | 'REVIEW_REQUIRED' | 'DUPLICATE' | 'VALIDATION_ERROR' | 'OCR_RETRY' | 'REJECT';

export interface AgentToolResult<T = unknown> {
  tool: string;
  success: boolean;
  data?: T;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

export interface InvoiceAgentContext {
  buyerGstin: string;
  orgId: string;
  existingInvoices: PurchaseInvoice[];
  existingReconciliations: ReconciliationItem[];
}

export interface InvoiceAgentResult {
  decision: AgentDecision;
  confidence: number;
  invoice?: Partial<PurchaseInvoice>;
  ocr?: { confidenceScores: FieldConfidences; uncertainFields: string[]; warnings: string[] };
  validation?: { isValid: boolean; errors: string[]; warnings: string[] };
  duplicate?: { isDuplicate: boolean; duplicateInvoiceId?: string; duplicateInvoiceNumber?: string };
  itc?: { eligibility: PurchaseInvoice['itcEligibility']; eligibleITC: number; blockedITC: number; pendingReviewITC: number; reasons: string[] };
  reconciliation?: { status: 'MATCHED' | 'PROBABLE' | 'MISMATCH' | 'MISSING_IN_2B' | 'NOT_AVAILABLE'; matchType?: ReconciliationItem['matchType']; matchScore?: number; reason?: string };
  toolResults: AgentToolResult[];
  reasons: string[];
  nextAction: string;
  agentVersion: string;
  startedAt: string;
  completedAt: string;
}
