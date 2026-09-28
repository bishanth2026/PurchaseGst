export interface AiAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAssistantContext {
  organization: {
    name: string;
    gstin: string;
    currentReturnPeriod: string;
  };
  invoices: Array<{
    invoiceNumber: string;
    supplierName: string;
    supplierGstin: string;
    invoiceDate: string;
    totalAmount: number;
    taxableValue: number;
    totalTax: number;
    itcEligibility?: string;
    status?: string;
    returnPeriod?: string;
  }>;
  gstr2bCount: number;
  reconciliationSummary: {
    total: number;
    matched: number;
    probable: number;
    mismatches: number;
    missingIn2B: number;
    missingInBooks: number;
  };
}

const ENDPOINT = 'https://obdkzsxdbaoudzudzazi.supabase.co/functions/v1/biznexco-ai';

export async function askBiznexcoAi(
  message: string,
  context: AiAssistantContext,
  history: AiAssistantMessage[] = [],
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message.trim(),
      context,
      history: history.slice(-10),
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error('AI service returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'AI Assistant request failed.');
  }

  if (!payload?.answer) {
    throw new Error('AI Assistant returned no answer.');
  }

  return String(payload.answer);
}
