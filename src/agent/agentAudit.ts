import { InvoiceAgentResult } from './agentTypes';

export interface AgentAuditEvent {
  id: string;
  invoiceId?: string;
  fileName?: string;
  decision: InvoiceAgentResult['decision'];
  confidence: number;
  reasons: string[];
  tools: Array<{ name: string; success: boolean; durationMs: number }>;
  timestamp: string;
  agentVersion: string;
}

const STORAGE_KEY = 'biznexco_invoice_agent_audit_v1';

export function recordAgentAudit(result: InvoiceAgentResult, fileName?: string): AgentAuditEvent {
  const event: AgentAuditEvent = {
    id: 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    invoiceId: result.invoice?.id,
    fileName,
    decision: result.decision,
    confidence: result.confidence,
    reasons: result.reasons,
    tools: result.toolResults.map((x) => ({ name: x.tool, success: x.success, durationMs: x.durationMs })),
    timestamp: result.completedAt,
    agentVersion: result.agentVersion,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: AgentAuditEvent[] = raw ? JSON.parse(raw) : [];
    events.unshift(event);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, 500)));
  } catch {}
  return event;
}
