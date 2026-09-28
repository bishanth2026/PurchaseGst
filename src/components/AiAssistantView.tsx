import React, { useMemo, useState } from 'react';
import { Bot, Send, Sparkles, Database, BookOpen, RotateCcw } from 'lucide-react';
import { PurchaseInvoice, Organization } from '../types';
import { ReconciliationItem } from '../types';
import { askBiznexcoAi, AiAssistantMessage } from '../services/aiAssistantService';
import { GeminiLiveVoice } from './GeminiLiveVoice';

interface AiAssistantViewProps {
  organization: Organization;
  invoices: PurchaseInvoice[];
  gstr2bCount: number;
  reconciliations: ReconciliationItem[];
}

const starterQuestions = [
  'What is GSTR-2B and how is it used in this app?',
  'Explain the difference between matched, probable and mismatch invoices.',
  'How does the AI invoice agent decide that an invoice needs review?',
  'How many invoices are currently in this return period?',
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  organization,
  invoices,
  gstr2bCount,
  reconciliations,
}) => {
  const [messages, setMessages] = useState<AiAssistantMessage[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am the Biznexco AI Assistant. Ask me general accounting/GST questions or questions about the data and workflows currently visible in this app.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          'Chat cleared. Ask me a GST/accounting question or ask about the current Biznexco data.',
      },
    ]);
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-400" />
            Biznexco AI Assistant
            <span className="text-[10px] px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              GENERAL + APP AWARE
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Ask common questions or ask about the current Purchase Register, GSTR-2B and reconciliation data.
          </p>
          <GeminiLiveVoice
            language="en-IN"
            context={{
              organization: context.organization,
              invoiceCount: invoices.length,
              gstr2bCount: context.gstr2bCount,
              reconciliationSummary: context.reconciliationSummary,
              invoiceSamples: context.invoices.slice(0, 50).map((invoice) => ({
                invoiceNumber: invoice.invoiceNumber,
                supplierName: invoice.supplierName,
                totalAmount: invoice.totalAmount,
                itcEligibility: invoice.itcEligibility,
                status: invoice.status,
              })),
            }}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {starterQuestions.map((question) => (
              <button
                key={question}
                onClick={() => void send(question)}
                disabled={busy}
                className="text-[11px] text-slate-400 hover:text-indigo-300 border border-slate-800 hover:border-indigo-500/30 rounded-lg px-2.5 py-1.5 disabled:opacity-40"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
