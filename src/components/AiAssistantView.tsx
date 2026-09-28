import React, { useMemo, useState } from 'react';
import { Bot, Send, Sparkles, Database, BookOpen, RotateCcw } from 'lucide-react';
import { PurchaseInvoice, Organization } from '../types';
import { ReconciliationItem } from '../types';
import { askBiznexcoAi, AiAssistantMessage } from '../services/aiAssistantService';

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

  const context = useMemo(() => {
    const counts = {
      matched: reconciliations.filter((r) => r.matchType === 'EXACT').length,
      probable: reconciliations.filter((r) => r.matchType === 'PROBABLE').length,
      mismatches: reconciliations.filter((r) => ['MISMATCH_VALUE', 'MISMATCH_TAX', 'CRN_DBN_DIFF'].includes(r.matchType)).length,
      missingIn2B: reconciliations.filter((r) => r.matchType === 'MISSING_IN_2B').length,
      missingInBooks: reconciliations.filter((r) => r.matchType === 'MISSING_IN_BOOKS').length,
    };

    return {
      organization: {
        name: organization.name,
        gstin: organization.gstin,
        currentReturnPeriod: organization.currentReturnPeriod,
      },
      invoices: invoices.slice(0, 200).map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplierName,
        supplierGstin: invoice.supplierGstin,
        invoiceDate: invoice.invoiceDate,
        totalAmount: invoice.totalAmount,
        taxableValue: invoice.taxableValue,
        totalTax: invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount + invoice.cessAmount,
        itcEligibility: invoice.itcEligibility,
        status: invoice.status,
        returnPeriod: invoice.returnPeriod,
      })),
      gstr2bCount,
      reconciliationSummary: {
        total: reconciliations.length,
        ...counts,
      },
    };
  }, [organization, invoices, gstr2bCount, reconciliations]);

  const send = async (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question || busy) return;

    const nextMessages: AiAssistantMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);

    try {
      const answer = await askBiznexcoAi(question, context, nextMessages);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            error?.message ||
            'The AI Assistant could not complete the request. Check the AI service configuration.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

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
        </div>
        <button
          onClick={clearChat}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear Chat
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <Sparkles className="w-5 h-5 text-indigo-400 mb-2" />
          <div className="text-sm font-bold text-white">General Questions</div>
          <div className="text-xs text-slate-500 mt-1">GST, accounting, finance and business concepts.</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <Database className="w-5 h-5 text-emerald-400 mb-2" />
          <div className="text-sm font-bold text-white">App-Aware Answers</div>
          <div className="text-xs text-slate-500 mt-1">Uses the current period and app data supplied to the assistant.</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <BookOpen className="w-5 h-5 text-amber-400 mb-2" />
          <div className="text-sm font-bold text-white">Explain Results</div>
          <div className="text-xs text-slate-500 mt-1">Ask why an invoice, ITC or reconciliation result looks the way it does.</div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="h-[480px] overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-sm text-white whitespace-pre-wrap'
                    : 'max-w-[90%] rounded-2xl rounded-bl-md bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap'
                }
              >
                {message.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-slate-800 border border-slate-700 px-4 py-3 text-xs text-slate-400">
                AI is analyzing your question…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask a GST, accounting or Biznexco question…"
              className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              disabled={busy}
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

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
