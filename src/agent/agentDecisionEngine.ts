import { AgentDecision, InvoiceAgentResult } from './agentTypes';

export interface DecisionInputs {
  ocrFailed: boolean;
  uncertainFields: string[];
  validationErrors: string[];
  validationWarnings: string[];
  duplicate: boolean;
  blockedITC: number;
  pendingITC: number;
}

export function decideInvoiceAgent(inputs: DecisionInputs): {
  decision: AgentDecision;
  confidence: number;
  reasons: string[];
  nextAction: string;
} {
  if (inputs.ocrFailed) return {
    decision: 'OCR_RETRY', confidence: 0,
    reasons: ['OCR extraction failed; no invoice data was trusted.'],
    nextAction: 'Retry OCR or review the source document manually.',
  };

  if (inputs.duplicate) return {
    decision: 'DUPLICATE', confidence: 0.99,
    reasons: ['Supplier GSTIN and normalized invoice number match an existing purchase invoice.'],
    nextAction: 'Do not create a second purchase voucher. Review the existing invoice.',
  };

  if (inputs.validationErrors.length > 0) return {
    decision: 'VALIDATION_ERROR', confidence: 0.98,
    reasons: inputs.validationErrors,
    nextAction: 'Correct the validation errors before approval.',
  };

  if (inputs.uncertainFields.length > 0 || inputs.pendingITC > 0) return {
    decision: 'REVIEW_REQUIRED', confidence: 0.75,
    reasons: [
      ...(inputs.uncertainFields.length ? ['Low-confidence fields: ' + inputs.uncertainFields.join(', ')] : []),
      ...(inputs.pendingITC > 0 ? ['₹' + inputs.pendingITC.toFixed(2) + ' ITC is pending eligibility review.'] : []),
      ...inputs.validationWarnings,
    ],
    nextAction: 'Human review is required before committing this invoice.',
  };

  return {
    decision: 'PROCESS', confidence: 0.95,
    reasons: [
      'OCR completed without low-confidence fields.',
      'Invoice validation passed.',
      'No duplicate was detected.',
      inputs.blockedITC > 0 ? '₹' + inputs.blockedITC.toFixed(2) + ' ITC is blocked under eligibility rules.' : 'No blocked ITC was detected.',
    ],
    nextAction: 'Ready for human approval and commit to the Purchase Register.',
  };
}

export function agentDecisionLabel(result: Pick<InvoiceAgentResult, 'decision'>): string {
  return result.decision.replaceAll('_', ' ');
}
