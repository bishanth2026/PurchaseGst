import { InvoiceAgentContext, InvoiceAgentResult } from './agentTypes';
import { agentTools } from './agentTools';
import { decideInvoiceAgent } from './agentDecisionEngine';
import { recordAgentAudit } from './agentAudit';

const AGENT_VERSION = 'invoice-agent-v1';

export async function runInvoiceAgent(file: File, context: InvoiceAgentContext): Promise<InvoiceAgentResult> {
  const startedAt = new Date().toISOString();
  const toolResults: any[] = [];

  const ocrTool = await agentTools.extractInvoice(file, context);
  toolResults.push(ocrTool);

  if (!ocrTool.success || !ocrTool.data) {
    const result: InvoiceAgentResult = {
      decision: 'OCR_RETRY',
      confidence: 0,
      toolResults,
      reasons: ['The OCR tool failed and no extracted data was trusted.', ...(ocrTool.errors || [])],
      nextAction: 'Retry extraction. If it continues to fail, review the invoice manually.',
      agentVersion: AGENT_VERSION,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    recordAgentAudit(result, file.name);
    return result;
  }

  const ocr = ocrTool.data;
  const invoice = { ...ocr.invoice };

  const validationTool = await agentTools.validateInvoice(invoice, context);
  const duplicateTool = await agentTools.checkDuplicateInvoice(invoice, context);
  toolResults.push(validationTool, duplicateTool);

  const validation = validationTool.data || { isValid: false, errors: ['Validation tool failed.'], warnings: [] };
  const duplicate = duplicateTool.data || { isDuplicate: false };

  const itcTool = await agentTools.checkItcEligibility(invoice);
  toolResults.push(itcTool);

  const itc = itcTool.data || {
    eligibility: invoice.itcEligibility,
    eligibleITC: 0,
    blockedITC: 0,
    pendingReviewITC: 0,
    reasons: ['ITC tool failed.'],
  };

  const decision = decideInvoiceAgent({
    ocrFailed: false,
    uncertainFields: ocr.uncertainFields,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    duplicate: duplicate.isDuplicate,
    blockedITC: itc.blockedITC,
    pendingITC: itc.pendingReviewITC,
  });

  invoice.status =
    decision.decision === 'PROCESS' ? 'APPROVED' :
    decision.decision === 'DUPLICATE' ? 'FLAGGED' : 'PENDING_REVIEW';

  const result: InvoiceAgentResult = {
    decision: decision.decision,
    confidence: decision.confidence,
    invoice,
    ocr: { confidenceScores: ocr.confidenceScores, uncertainFields: ocr.uncertainFields, warnings: ocr.warnings },
    validation,
    duplicate,
    itc,
    toolResults,
    reasons: decision.reasons,
    nextAction: decision.nextAction,
    agentVersion: AGENT_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  recordAgentAudit(result, file.name);
  return result;
}

export function isAgentCommitAllowed(decision: InvoiceAgentResult['decision']): boolean {
  return decision === 'PROCESS' || decision === 'REVIEW_REQUIRED';
}
