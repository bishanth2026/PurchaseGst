import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  Filter,
  History,
  Info,
  Link,
  MessageSquare,
  MinusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  AuditLog,
  GSTR2BRecord,
  MatchType,
  Organization,
  PurchaseInvoice,
  ReconciliationItem,
  ReviewStatus,
} from '../types';
import { InvoiceService } from '../services/invoiceService';

interface ReconciliationViewProps {
  reconciliations: ReconciliationItem[];
  booksInvoices: PurchaseInvoice[];
  gstr2bRecords: GSTR2BRecord[];
  organization: Organization;
  onRefreshReconciliation: () => void;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({
  reconciliations,
  booksInvoices,
  gstr2bRecords,
  organization,
  onRefreshReconciliation,
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<ReconciliationItem | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Manual link modal state
  const [manualLinkTarget, setManualLinkTarget] = useState<ReconciliationItem | null>(null);
  const [manualLinkSelectedBookId, setManualLinkSelectedBookId] = useState('');
  const [manualLinkSelected2BId, setManualLinkSelected2BId] = useState('');

  const filterTabs = [
    { id: 'ALL', label: 'All Records', count: reconciliations.length },
    {
      id: 'EXACT',
      label: 'Exact Matches',
      count: reconciliations.filter((r) => r.matchType === 'EXACT').length,
      badgeColor: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'PROBABLE',
      label: 'Probable Matches',
      count: reconciliations.filter((r) => r.matchType === 'PROBABLE').length,
      badgeColor: 'text-indigo-400 bg-indigo-500/10',
    },
    {
      id: 'MISMATCH',
      label: 'Tax / Value Mismatches',
      count: reconciliations.filter(
        (r) => r.matchType === 'MISMATCH_TAX' || r.matchType === 'MISMATCH_VALUE'
      ).length,
      badgeColor: 'text-amber-400 bg-amber-500/10',
    },
    {
      id: 'MISSING_IN_2B',
      label: 'Missing in GSTR-2B',
      count: reconciliations.filter((r) => r.matchType === 'MISSING_IN_2B').length,
      badgeColor: 'text-rose-400 bg-rose-500/10',
    },
    {
      id: 'MISSING_IN_BOOKS',
      label: 'Missing in Books',
      count: reconciliations.filter((r) => r.matchType === 'MISSING_IN_BOOKS').length,
      badgeColor: 'text-teal-400 bg-teal-500/10',
    },
    {
      id: 'DUPLICATE',
      label: 'Duplicates',
      count: reconciliations.filter((r) => r.matchType === 'DUPLICATE').length,
      badgeColor: 'text-purple-400 bg-purple-500/10',
    },
    {
      id: 'CRN_DBN_DIFF',
      label: 'Doc Type Diffs',
      count: reconciliations.filter((r) => r.matchType === 'CRN_DBN_DIFF').length,
      badgeColor: 'text-orange-400 bg-orange-500/10',
    },
  ];

  const filteredItems = useMemo(() => {
    return reconciliations.filter((item) => {
      // Tab filter
      if (activeFilter !== 'ALL') {
        if (activeFilter === 'MISMATCH') {
          if (item.matchType !== 'MISMATCH_TAX' && item.matchType !== 'MISMATCH_VALUE') {
            return false;
          }
        } else if (item.matchType !== activeFilter) {
          return false;
        }
      }

      // Search filter
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const bInv = item.bookInvoice;
        const g2b = item.gstr2bRecord;
        const matchName =
          (bInv?.supplierName?.toLowerCase().includes(q)) ||
          (g2b?.supplierName?.toLowerCase().includes(q));
        const matchGstin =
          (bInv?.supplierGstin?.toLowerCase().includes(q)) ||
          (g2b?.supplierGstin?.toLowerCase().includes(q));
        const matchInvNo =
          (bInv?.invoiceNumber?.toLowerCase().includes(q)) ||
          (g2b?.invoiceNumber?.toLowerCase().includes(q));

        if (!matchName && !matchGstin && !matchInvNo) return false;
      }

      return true;
    });
  }, [reconciliations, activeFilter, searchTerm]);

  const handleUpdateStatus = (
    id: string,
    status: ReviewStatus,
    comments?: string
  ) => {
    InvoiceService.updateReconciliationStatus(id, status, comments, 'Tax Auditor');
    onRefreshReconciliation();
    if (selectedItemForDetail && selectedItemForDetail.id === id) {
      setSelectedItemForDetail((prev) => (prev ? { ...prev, status, userComments: comments } : null));
    }
  };

  const handleOpenAudit = () => {
    setAuditLogs(InvoiceService.getAuditLogs());
    setShowAuditDrawer(true);
  };

  const handleManualLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLinkSelectedBookId || !manualLinkSelected2BId) return;

    try {
      InvoiceService.manuallyLinkMatch(
        manualLinkSelectedBookId,
        manualLinkSelected2BId,
        commentText || 'Manually linked by Tax Auditor',
        'Tax Auditor'
      );
      setManualLinkTarget(null);
      setCommentText('');
      onRefreshReconciliation();
    } catch (err: any) {
      alert(err.message || 'Linking failed');
    }
  };

  const formatINR = (v: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(v);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <span>Intelligent GST Reconciliation Engine</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Multi-Pass Rule Matcher
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reconciles inward supplies with GSTR-2B. Strict criteria validation with detailed
            variance reasons.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleOpenAudit}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>Audit History</span>
          </button>

          <button
            onClick={onRefreshReconciliation}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Re-run Engine</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-slate-800 border-emerald-500/50 text-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  tab.badgeColor || 'bg-slate-800 text-slate-300'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by supplier name, GSTIN, or invoice number..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium">
          Showing {filteredItems.length} records
        </span>
      </div>

      {/* Reconciliation Cards List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
            No reconciliation records found under selected filter.
          </div>
        ) : (
          filteredItems.map((item) => {
            const b = item.bookInvoice;
            const g = item.gstr2bRecord;
            const isExact = item.matchType === 'EXACT';
            const isProbable = item.matchType === 'PROBABLE';
            const isMissing2B = item.matchType === 'MISSING_IN_2B';
            const isMissingBooks = item.matchType === 'MISSING_IN_BOOKS';
            const isMismatch =
              item.matchType === 'MISMATCH_TAX' ||
              item.matchType === 'MISMATCH_VALUE' ||
              item.matchType === 'CRN_DBN_DIFF';
            const isDuplicate = item.matchType === 'DUPLICATE';

            const borderClass = isExact
              ? 'border-emerald-800/40 hover:border-emerald-700/60'
              : isProbable
              ? 'border-indigo-800/40 hover:border-indigo-700/60'
              : isMismatch
              ? 'border-amber-800/40 hover:border-amber-700/60'
              : isMissing2B
              ? 'border-rose-800/40 hover:border-rose-700/60'
              : isDuplicate
              ? 'border-purple-800/40 hover:border-purple-700/60'
              : 'border-teal-800/40 hover:border-teal-700/60';

            return (
              <div
                key={item.id}
                className={`bg-slate-900/90 border ${borderClass} rounded-2xl p-4 transition-all shadow-sm space-y-3`}
              >
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2">
                    {/* Match Type Badge */}
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isExact
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : isProbable
                          ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
                          : isMismatch
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                          : isMissing2B
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                          : isDuplicate
                          ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                          : 'bg-teal-950/80 text-teal-300 border-teal-800'
                      }`}
                    >
                      {item.matchType}
                    </span>

                    <span className="text-xs font-semibold text-white">
                      Score: {item.matchScore}%
                    </span>

                    {/* Review status badge */}
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded font-medium ${
                        item.status === 'ACCEPTED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : item.status === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      Status: {item.status}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-2">
                    {item.status !== 'ACCEPTED' && (
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'ACCEPTED')}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition"
                      >
                        <Check className="w-3 h-3" />
                        <span>Accept Match</span>
                      </button>
                    )}

                    {item.status !== 'REJECTED' && (
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'REJECTED')}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    )}

                    {(isMissing2B || isMissingBooks || isProbable) && (
                      <button
                        onClick={() => {
                          setManualLinkTarget(item);
                          if (item.invoiceId) setManualLinkSelectedBookId(item.invoiceId);
                          if (item.gstr2bId) setManualLinkSelected2BId(item.gstr2bId);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
                      >
                        <Link className="w-3 h-3 text-indigo-400" />
                        <span>Manually Link</span>
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedItemForDetail(item)}
                      className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                      title="Inspect full comparison"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Match Reason Banner */}
                <div className="text-xs p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-slate-300 flex items-start space-x-2">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Match Reason: </span>
                    <span>{item.matchReason}</span>
                    {item.suggestedAction && (
                      <span className="block text-[11px] text-amber-300/90 mt-0.5 font-medium">
                        Suggested Action: {item.suggestedAction}
                      </span>
                    )}
                  </div>
                </div>

                {/* Side-by-Side Comparison: Books vs GSTR-2B */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Left: Purchase Book Entry */}
                  <div
                    className={`p-3 rounded-xl border ${
                      b ? 'bg-slate-800/40 border-slate-700/60' : 'bg-rose-950/20 border-rose-900/30'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-700/40">
                      <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                        Purchase Register (Book)
                      </span>
                      {b && (
                        <span className="font-mono font-bold text-white">
                          {b.documentType} • {b.invoiceNumber}
                        </span>
                      )}
                    </div>

                    {b ? (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-white truncate">{b.supplierName}</div>
                        <div className="font-mono text-[11px] text-emerald-400">{b.supplierGstin}</div>
                        <div className="text-slate-400">Date: {b.invoiceDate}</div>
                        <div className="grid grid-cols-3 gap-1 pt-1 font-mono">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Taxable</span>
                            <span>₹{b.taxableValue.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">CGST+SGST</span>
                            <span className="text-emerald-400">
                              ₹{(b.cgstAmount + b.sgstAmount).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">IGST</span>
                            <span className="text-indigo-400">₹{b.igstAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-rose-400 italic">
                        Not recorded in Purchase Register (Unclaimed voucher)
                      </div>
                    )}
                  </div>

                  {/* Right: GSTR-2B Statement Record */}
                  <div
                    className={`p-3 rounded-xl border ${
                      g ? 'bg-slate-800/40 border-slate-700/60' : 'bg-rose-950/20 border-rose-900/30'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-700/40">
                      <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                        GSTR-2B Statement (Govt Portal)
                      </span>
                      {g && (
                        <span className="font-mono font-bold text-white">
                          {g.documentType} • {g.invoiceNumber}
                        </span>
                      )}
                    </div>

                    {g ? (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-white truncate">{g.supplierName}</div>
                        <div className="font-mono text-[11px] text-emerald-400">{g.supplierGstin}</div>
                        <div className="text-slate-400">Date: {g.invoiceDate}</div>
                        <div className="grid grid-cols-3 gap-1 pt-1 font-mono">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Taxable</span>
                            <span>₹{g.taxableValue.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">CGST+SGST</span>
                            <span className="text-emerald-400">
                              ₹{(g.cgstAmount + g.sgstAmount).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">IGST</span>
                            <span className="text-indigo-400">₹{g.igstAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-rose-400 italic">
                        Missing in GSTR-2B (Supplier defaulted in GSTR-1)
                      </div>
                    )}
                  </div>
                </div>

                {/* Variance Ribbon if mismatch */}
                {(Math.abs(item.taxableDiff) > 0.01 ||
                  Math.abs(item.cgstDiff) > 0.01 ||
                  Math.abs(item.sgstDiff) > 0.01 ||
                  Math.abs(item.igstDiff) > 0.01) &&
                  b &&
                  g && (
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono grid grid-cols-4 gap-2 text-center">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Taxable Diff</span>
                        <span
                          className={
                            Math.abs(item.taxableDiff) > 0.01 ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }
                        >
                          ₹{item.taxableDiff.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">CGST Diff</span>
                        <span
                          className={
                            Math.abs(item.cgstDiff) > 0.01 ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }
                        >
                          ₹{item.cgstDiff.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">SGST Diff</span>
                        <span
                          className={
                            Math.abs(item.sgstDiff) > 0.01 ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }
                        >
                          ₹{item.sgstDiff.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">IGST Diff</span>
                        <span
                          className={
                            Math.abs(item.igstDiff) > 0.01 ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }
                        >
                          ₹{item.igstDiff.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
              </div>
            );
          })
        )}
      </div>

      {/* Manual Link Modal */}
      {manualLinkTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Link className="w-4 h-4 text-indigo-400" />
                <span>Manual Reconciliation Linkage</span>
              </h3>
              <button
                onClick={() => setManualLinkTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualLinkSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Select Purchase Register Book Invoice:
                </label>
                <select
                  value={manualLinkSelectedBookId}
                  onChange={(e) => setManualLinkSelectedBookId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Book Invoice --</option>
                  {booksInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} | {inv.supplierName} | ₹{inv.totalAmount.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Select GSTR-2B Statement Record:
                </label>
                <select
                  value={manualLinkSelected2BId}
                  onChange={(e) => setManualLinkSelected2BId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose GSTR-2B Record --</option>
                  {gstr2bRecords.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.invoiceNumber} | {rec.supplierName} | ₹{rec.invoiceValue.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Auditor Linkage Notes / Reason:
                </label>
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Document why this manual linkage is valid..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualLinkTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg"
                >
                  Confirm Manual Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Reconciliation Record View Modal */}
      {selectedItemForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <FileCheck2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">
                    Detailed Reconciliation Record Inspection
                  </h3>
                  <span className="text-xs font-mono text-slate-500">
                    ID: {selectedItemForDetail.id}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Full comparative audit of Purchase Register voucher against GSTR-2B portal record.
                </p>
              </div>
              <button
                onClick={() => setSelectedItemForDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Manual Review Warning Banner if present */}
            {selectedItemForDetail.manualReviewWarning && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-300">Statutory Notice & Review Policy</div>
                  <div className="leading-relaxed">{selectedItemForDetail.manualReviewWarning}</div>
                </div>
              </div>
            )}

            {/* 4 Core Inspection Metrics Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Matching Method
                </span>
                <span className="font-mono font-bold text-indigo-300 block truncate" title={selectedItemForDetail.matchingMethod}>
                  {selectedItemForDetail.matchingMethod || selectedItemForDetail.matchType}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Category: {selectedItemForDetail.matchType}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Date Difference
                </span>
                <span
                  className={`font-mono font-bold block ${
                    (selectedItemForDetail.dateDifferenceDays || 0) > 30
                      ? 'text-amber-400 font-extrabold'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedItemForDetail.dateDifferenceDays !== undefined
                    ? `${selectedItemForDetail.dateDifferenceDays} Days`
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {(selectedItemForDetail.dateDifferenceDays || 0) > 30
                    ? '⚠️ Exceeds 30d window'
                    : 'Within statutory period'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Match Confidence
                </span>
                <span
                  className={`font-mono font-bold block ${
                    selectedItemForDetail.confidenceLevel === 'HIGH'
                      ? 'text-emerald-400'
                      : selectedItemForDetail.confidenceLevel === 'MEDIUM'
                      ? 'text-indigo-400'
                      : 'text-rose-400'
                  }`}
                >
                  {selectedItemForDetail.confidenceLevel} ({selectedItemForDetail.matchScore}%)
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Algorithmic Score
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Manual Review Status
                </span>
                <span
                  className={`font-mono font-bold block ${
                    selectedItemForDetail.status === 'ACCEPTED'
                      ? 'text-emerald-400'
                      : selectedItemForDetail.status === 'REJECTED'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {selectedItemForDetail.status}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {selectedItemForDetail.reviewedBy ? `By: ${selectedItemForDetail.reviewedBy}` : 'Pending Auditor Action'}
                </span>
              </div>
            </div>

            {/* Side-by-Side Data Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Left: Books Invoice Details */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-700/40">
                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                    <span>Purchase Register (Book Invoice)</span>
                  </span>
                  {selectedItemForDetail.bookInvoice ? (
                    <span className="font-mono text-emerald-400 font-bold">
                      {selectedItemForDetail.bookInvoice.documentType}
                    </span>
                  ) : (
                    <span className="text-rose-400 text-[10px]">Unrecorded</span>
                  )}
                </div>

                {selectedItemForDetail.bookInvoice ? (
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Invoice Number:</span>
                      <span className="text-white font-bold">{selectedItemForDetail.bookInvoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Normalized Number:</span>
                      <span className="text-indigo-300">{selectedItemForDetail.bookInvoice.normalizedInvoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Invoice Date:</span>
                      <span className="text-white">{selectedItemForDetail.bookInvoice.invoiceDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Supplier Name:</span>
                      <span className="text-white truncate max-w-[200px]" title={selectedItemForDetail.bookInvoice.supplierName}>
                        {selectedItemForDetail.bookInvoice.supplierName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Supplier GSTIN:</span>
                      <span className="text-emerald-400 font-bold">{selectedItemForDetail.bookInvoice.supplierGstin}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-700/30">
                      <span className="text-slate-400">Taxable Value:</span>
                      <span className="text-white">₹{selectedItemForDetail.bookInvoice.taxableValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">CGST Amount:</span>
                      <span className="text-emerald-400">₹{selectedItemForDetail.bookInvoice.cgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">SGST Amount:</span>
                      <span className="text-emerald-400">₹{selectedItemForDetail.bookInvoice.sgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">IGST Amount:</span>
                      <span className="text-indigo-400">₹{selectedItemForDetail.bookInvoice.igstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-1 border-t border-slate-700/30">
                      <span className="text-slate-300">Total Invoice Amount:</span>
                      <span className="text-white">₹{selectedItemForDetail.bookInvoice.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1 border-t border-slate-700/30">
                      <span className="text-slate-400">Section 17(5) Status:</span>
                      <span className={selectedItemForDetail.bookInvoice.itcEligibility === 'INELIGIBLE_17_5' ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {selectedItemForDetail.bookInvoice.itcEligibility === 'INELIGIBLE_17_5' ? 'BLOCKED CREDIT' : 'ELIGIBLE'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-rose-400 text-xs italic">
                    Missing in Purchase Register (Unrecorded voucher)
                  </div>
                )}
              </div>

              {/* Right: GSTR-2B Statement Details */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-700/40">
                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                    <span>GSTR-2B Portal Statement</span>
                  </span>
                  {selectedItemForDetail.gstr2bRecord ? (
                    <span className="font-mono text-indigo-400 font-bold">
                      {selectedItemForDetail.gstr2bRecord.documentType}
                    </span>
                  ) : (
                    <span className="text-rose-400 text-[10px]">Unreported by Vendor</span>
                  )}
                </div>

                {selectedItemForDetail.gstr2bRecord ? (
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Invoice Number:</span>
                      <span className="text-white font-bold">{selectedItemForDetail.gstr2bRecord.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Normalized Number:</span>
                      <span className="text-indigo-300">
                        {selectedItemForDetail.bookInvoice?.normalizedInvoiceNumber || selectedItemForDetail.gstr2bRecord.invoiceNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Invoice Date:</span>
                      <span className="text-white">{selectedItemForDetail.gstr2bRecord.invoiceDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Supplier Name:</span>
                      <span className="text-white truncate max-w-[200px]" title={selectedItemForDetail.gstr2bRecord.supplierName}>
                        {selectedItemForDetail.gstr2bRecord.supplierName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Supplier GSTIN:</span>
                      <span className="text-emerald-400 font-bold">{selectedItemForDetail.gstr2bRecord.supplierGstin}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-700/30">
                      <span className="text-slate-400">Taxable Value:</span>
                      <span className="text-white">₹{selectedItemForDetail.gstr2bRecord.taxableValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">CGST Amount:</span>
                      <span className="text-emerald-400">₹{selectedItemForDetail.gstr2bRecord.cgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">SGST Amount:</span>
                      <span className="text-emerald-400">₹{selectedItemForDetail.gstr2bRecord.sgstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">IGST Amount:</span>
                      <span className="text-indigo-400">₹{selectedItemForDetail.gstr2bRecord.igstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-1 border-t border-slate-700/30">
                      <span className="text-slate-300">Total Invoice Value:</span>
                      <span className="text-white">₹{selectedItemForDetail.gstr2bRecord.invoiceValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1 border-t border-slate-700/30">
                      <span className="text-slate-400">GSTR-1 Filing Status:</span>
                      <span className="text-indigo-400">
                        {selectedItemForDetail.gstr2bRecord.gstr1FilingStatus || 'FILED'} (Filed {selectedItemForDetail.gstr2bRecord.filingDate || 'N/A'})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-rose-400 text-xs italic">
                    Missing in GSTR-2B (Supplier omitted filing in GSTR-1)
                  </div>
                )}
              </div>
            </div>

            {/* Comprehensive Financial Variance Ribbon */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Financial Variance Breakdown (GSTR-2B Statement minus Purchase Register)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Taxable Variance</span>
                  <span
                    className={`font-bold ${
                      Math.abs(selectedItemForDetail.taxableDiff) > 0.01 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    ₹{selectedItemForDetail.taxableDiff.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">CGST Variance</span>
                  <span
                    className={`font-bold ${
                      Math.abs(selectedItemForDetail.cgstDiff) > 0.01 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    ₹{selectedItemForDetail.cgstDiff.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">SGST Variance</span>
                  <span
                    className={`font-bold ${
                      Math.abs(selectedItemForDetail.sgstDiff) > 0.01 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    ₹{selectedItemForDetail.sgstDiff.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">IGST Variance</span>
                  <span
                    className={`font-bold ${
                      Math.abs(selectedItemForDetail.igstDiff) > 0.01 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    ₹{selectedItemForDetail.igstDiff.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Total ITC Discrepancy</span>
                  <span
                    className={`font-bold ${
                      Math.abs(
                        selectedItemForDetail.cgstDiff +
                          selectedItemForDetail.sgstDiff +
                          selectedItemForDetail.igstDiff
                      ) > 0.01
                        ? 'text-amber-400 font-extrabold'
                        : 'text-emerald-400'
                    }`}
                  >
                    ₹
                    {(
                      selectedItemForDetail.cgstDiff +
                      selectedItemForDetail.sgstDiff +
                      selectedItemForDetail.igstDiff
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Supporting Evidence & Matching Reason Audit */}
            {selectedItemForDetail.supportingEvidence && selectedItemForDetail.supportingEvidence.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800 text-xs space-y-2">
                <span className="font-bold text-slate-300 text-[11px] block">
                  Reconciliation Verification Evidence & Reasons:
                </span>
                <ul className="space-y-1 text-slate-300">
                  {selectedItemForDetail.supportingEvidence.map((ev, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Auditor Interactive Decision Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="text-slate-400">
                Suggested Statutory Action: <span className="text-slate-200">{selectedItemForDetail.suggestedAction}</span>
              </div>
              <div className="flex items-center space-x-2">
                {selectedItemForDetail.status !== 'ACCEPTED' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedItemForDetail.id, 'ACCEPTED')}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept Match</span>
                  </button>
                )}
                {selectedItemForDetail.status !== 'REJECTED' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedItemForDetail.id, 'REJECTED')}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold shadow-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedItemForDetail(null)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Drawer */}
      {showAuditDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Reconciliation Audit Trail</h3>
              </div>
              <button
                onClick={() => setShowAuditDrawer(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {auditLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-12">No audit logs recorded yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-800/50 border border-slate-800 rounded-xl space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-emerald-400 font-mono text-[11px]">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-200">{log.details}</div>
                    <div className="text-[11px] text-slate-400">By: {log.user}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
