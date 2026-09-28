import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, FileCheck2, GitBranch, History, RefreshCw, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { AgentAuditEvent } from '../agent/agentAudit';

const STORAGE_KEY = 'biznexco_invoice_agent_audit_v1';
const decisionMeta: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  PROCESS: { label: 'PROCESS', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  REVIEW_REQUIRED: { label: 'REVIEW REQUIRED', className: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: ShieldAlert },
  DUPLICATE: { label: 'DUPLICATE', className: 'text-orange-300 bg-orange-500/10 border-orange-500/20', icon: FileCheck2 },
  VALIDATION_ERROR: { label: 'VALIDATION ERROR', className: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: XCircle },
  OCR_RETRY: { label: 'OCR RETRY', className: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20', icon: RefreshCw },
  REJECT: { label: 'REJECT', className: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: XCircle },
};

export const AiAgentView: React.FC = () => {
  const [events, setEvents] = useState<AgentAuditEvent[]>([]);
  const [selected, setSelected] = useState<AgentAuditEvent | null>(null);
  const loadEvents = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setEvents(Array.isArray(parsed) ? parsed : []);
    } catch { setEvents([]); }
  };
  useEffect(() => { loadEvents(); }, []);
  const stats = useMemo(() => ({
    total: events.length,
    processed: events.filter(e => e.decision === 'PROCESS').length,
    review: events.filter(e => e.decision === 'REVIEW_REQUIRED').length,
    duplicates: events.filter(e => e.decision === 'DUPLICATE').length,
    avgConfidence: events.length ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : 0,
  }), [events]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2"><Bot className="w-6 h-6 text-indigo-400" />AI Invoice Agent <span className="text-[10px] px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">invoice-agent-v1</span></h2>
          <p className="text-xs text-slate-400 mt-1">Autonomous invoice analysis with human-in-the-loop review and an auditable decision trail.</p>
        </div>
        <button onClick={loadEvents} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"><RefreshCw className="w-3.5 h-3.5" /> Refresh Agent Log</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[["Invoices analyzed", stats.total, "text-white"],["Processed", stats.processed, "text-emerald-400"],["Review required", stats.review, "text-amber-400"],["Duplicates", stats.duplicates, "text-orange-400"],["Avg confidence", Math.round(stats.avgConfidence * 100) + "%", "text-indigo-400"]].map(([label, value, color]) => (
          <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</div><div className={"text-xl font-extrabold mt-1 " + color}>{value}</div></div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5"><GitBranch className="w-4 h-4 text-emerald-400" /><h3 className="text-sm font-bold text-white">Agent Workflow</h3></div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          {[['1','Invoice Upload','Document received'],['2','OCR Extraction','Gemini multimodal'],['3','Validation','GST + arithmetic'],['4','Duplicate Check','Supplier + invoice'],['5','ITC Analysis','Eligible / blocked / pending'],['6','Agent Decision','Process or review']].map(([n,title,desc], i) => (
            <React.Fragment key={n}><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-300 flex items-center justify-center text-[10px] font-bold mb-2">{n}</div><div className="text-xs font-bold text-white">{title}</div><div className="text-[10px] text-slate-500 mt-1">{desc}</div></div>{i < 5 && <div className="hidden md:flex items-center justify-center text-slate-700">→</div>}</React.Fragment>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-indigo-400" /><h3 className="text-sm font-bold text-white">Agent Decision History</h3><span className="text-[10px] text-slate-500 ml-auto">Latest 500 events stored locally</span></div>
        {events.length === 0 ? <div className="p-10 text-center"><Sparkles className="w-8 h-8 mx-auto text-slate-600 mb-3" /><p className="text-sm font-semibold text-slate-300">No agent runs yet</p><p className="text-xs text-slate-500 mt-1">Process an invoice from Batch Upload & OCR to populate this log.</p></div> :
          <div className="divide-y divide-slate-800">{events.map(event => { const meta = decisionMeta[event.decision] || decisionMeta.REVIEW_REQUIRED; const Icon = meta.icon; return <button key={event.id} onClick={() => setSelected(event)} className="w-full text-left px-5 py-3 hover:bg-slate-800/40 transition grid grid-cols-1 md:grid-cols-12 gap-2 items-center"><div className="md:col-span-4 truncate"><div className="text-xs font-semibold text-white truncate">{event.fileName || event.invoiceId || 'Invoice'}</div><div className="text-[10px] text-slate-500">{new Date(event.timestamp).toLocaleString()}</div></div><div className="md:col-span-3"><span className={"inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold " + meta.className}><Icon className="w-3 h-3" /> {meta.label}</span></div><div className="md:col-span-2 text-xs font-mono text-indigo-300">{Math.round(event.confidence * 100)}% confidence</div><div className="md:col-span-3 text-[10px] text-slate-500 truncate">{event.reasons[0] || 'No reason recorded'}</div></button>; })}</div>}
      </div>

      {selected && <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-white">Agent Analysis</h3><p className="text-xs text-slate-500 mt-1">{selected.fileName || selected.invoiceId || 'Invoice'}</p></div><button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-white">Close</button></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"><div className="bg-slate-950 rounded-xl p-3"><div className="text-[10px] text-slate-500">Decision</div><div className="text-sm font-bold text-indigo-300 mt-1">{selected.decision.replaceAll('_',' ')}</div></div><div className="bg-slate-950 rounded-xl p-3"><div className="text-[10px] text-slate-500">Confidence</div><div className="text-sm font-bold text-emerald-300 mt-1">{Math.round(selected.confidence * 100)}%</div></div><div className="bg-slate-950 rounded-xl p-3"><div className="text-[10px] text-slate-500">Agent version</div><div className="text-sm font-mono text-slate-300 mt-1">{selected.agentVersion}</div></div></div>
        <div className="mt-4"><div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Decision reasons</div><div className="space-y-1">{selected.reasons.map((reason,i)=><div key={i} className="text-xs text-slate-300">• {reason}</div>)}</div></div>
        <div className="mt-4"><div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Tools executed</div><div className="flex flex-wrap gap-2">{selected.tools.map((tool,i)=><span key={i} className={"text-[10px] px-2 py-1 rounded border " + (tool.success ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-300 bg-rose-500/10 border-rose-500/20')}>{tool.name} · {tool.durationMs}ms</span>)}</div></div>
      </div>}
    </div>
  );
};
