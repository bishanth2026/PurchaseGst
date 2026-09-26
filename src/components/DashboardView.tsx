import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Percent,
  Play,
  Scale,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { DashboardMetrics, Organization } from '../types';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  organization: Organization;
  onNavigateTab: (tab: string) => void;
  onRunReconciliation: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  organization,
  onNavigateTab,
  onRunReconciliation,
}) => {
  const matchRate =
    metrics.totalBooksInvoices > 0
      ? Math.round((metrics.matchedCount / metrics.totalBooksInvoices) * 100)
      : 0;

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Quick Action */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
              Tax Period: {organization.currentReturnPeriod}
            </span>
            <span className="text-xs text-slate-400">
              State: {organization.stateCode} ({organization.tradeName})
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-2">
            GST Reconciliation & ITC Executive Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Real-time reconciliation between Purchase Books and GSTR-2B. Identifies ITC leakage,
            tax rate disputes, and ensures 100% statutory compliance under CGST Section 16(2)(aa).
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onRunReconciliation}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25 transition-all"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Run Reconciliation</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Primary Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Books ITC */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Books ITC</span>
            <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {formatINR(metrics.totalBooksITC)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
            <span>{metrics.totalBooksInvoices} Invoices Recorded</span>
            <span className="text-slate-300">Taxable: {formatINR(metrics.totalBooksTaxable)}</span>
          </div>
        </div>

        {/* Total GSTR-2B ITC */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">GSTR-2B Available ITC</span>
            <ShieldCheck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {formatINR(metrics.total2BITC)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
            <span>{metrics.total2BRecords} Supplier Filings</span>
            <span className="text-slate-300">2B Taxable: {formatINR(metrics.total2BTaxable)}</span>
          </div>
        </div>

        {/* Matched ITC */}
        <div className="bg-slate-900/90 border border-emerald-900/40 p-5 rounded-xl bg-gradient-to-br from-slate-900 to-emerald-950/20">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Matched & Claimable ITC</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-emerald-300 font-mono">
            {formatINR(metrics.matchedITC)}
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-500/80 mt-3 pt-3 border-t border-emerald-900/30">
            <span>{metrics.matchedCount} Invoices Matched</span>
            <span>{matchRate}% Match Rate</span>
          </div>
        </div>

        {/* Unresolved Records / Risk */}
        <div className="bg-slate-900/90 border border-amber-900/40 p-5 rounded-xl bg-gradient-to-br from-slate-900 to-amber-950/20">
          <div className="flex items-center justify-between text-amber-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Actionable / Unresolved</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-amber-300 font-mono">
            {metrics.unresolvedCount} Records
          </div>
          <div className="flex items-center justify-between text-xs text-amber-500/80 mt-3 pt-3 border-t border-amber-900/30">
            <span>Requires Review</span>
            <button
              onClick={() => onNavigateTab('reconciliation')}
              className="text-amber-300 hover:underline font-medium"
            >
              Open Queue &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* ITC Breakdown & Statutory Separation: Reconciliation vs Eligibility */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section 1: Reconciliation Status ITC Matrix */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Scale className="w-4 h-4 text-emerald-400" />
                <span>ITC Variance & Mismatch Breakdown</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact categorisation of all input tax credit discrepancies
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('reconciliation')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <span>View Full Ledger</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Matched row */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <div>
                  <div className="text-sm font-semibold text-white">Exact Matched ITC</div>
                  <div className="text-xs text-slate-400">
                    {metrics.matchedCount} invoices verified on GSTIN, date, number & taxes
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {formatINR(metrics.matchedITC)}
                </div>
                <div className="text-xs text-emerald-500/90 font-medium">Auto-Eligible</div>
              </div>
            </div>

            {/* Probable row */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-indigo-400" />
                <div>
                  <div className="text-sm font-semibold text-white">Probable Matched ITC</div>
                  <div className="text-xs text-slate-400">
                    {metrics.probableCount} invoices with normalized invoice no / date tolerance
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-indigo-300 font-mono">
                  {formatINR(metrics.probableITC)}
                </div>
                <div className="text-xs text-indigo-400">Requires Confirmation</div>
              </div>
            </div>

            {/* Mismatched Tax / Value row */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-amber-900/30">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div>
                  <div className="text-sm font-semibold text-white">Tax / Rate Mismatch</div>
                  <div className="text-xs text-slate-400">
                    {metrics.mismatchCount} records with tax rate dispute or taxable value difference
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-amber-400 font-mono">
                  {formatINR(metrics.mismatchITC)}
                </div>
                <div className="text-xs text-amber-500">Hold Until Rectified</div>
              </div>
            </div>

            {/* Missing in 2B (At risk) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-rose-900/40">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div>
                  <div className="text-sm font-semibold text-white">Missing in GSTR-2B (ITC At Risk)</div>
                  <div className="text-xs text-slate-400">
                    {metrics.missingIn2BCount} purchase invoices recorded but vendor has NOT filed GSTR-1
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-rose-400 font-mono">
                  {formatINR(metrics.missingIn2BITC)}
                </div>
                <div className="text-xs text-rose-500 font-semibold">Risk of Forfeiture</div>
              </div>
            </div>

            {/* Missing in Books (Unclaimed opportunity) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-teal-900/30">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-teal-400" />
                <div>
                  <div className="text-sm font-semibold text-white">Missing in Books (Unclaimed ITC)</div>
                  <div className="text-xs text-slate-400">
                    {metrics.missingInBooksCount} vendor invoices present in 2B but absent in Purchase Register
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-teal-300 font-mono">
                  {formatINR(metrics.missingInBooksITC)}
                </div>
                <div className="text-xs text-teal-400 font-medium">Unclaimed Benefit</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Statutory ITC Eligibility vs Blocked u/s 17(5) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 mb-1">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Statutory Separation</span>
            </div>
            <h2 className="text-base font-bold text-white">ITC Eligibility Analysis</h2>
            <p className="text-xs text-slate-400 mt-1">
              Section 16 & 17(5) compliance: Distinguishing matched 2B status from actual legal eligibility.
            </p>

            <div className="mt-6 space-y-4">
              {/* Eligible */}
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1">
                  <span>Eligible ITC</span>
                  <span className="text-emerald-400 font-mono font-bold">{formatINR(metrics.eligibleITC)}</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{
                      width: `${
                        metrics.totalBooksITC > 0
                          ? Math.min(100, (metrics.eligibleITC / metrics.totalBooksITC) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Eligible for claim in Table 4(A)(5) of Form GSTR-3B.
                </span>
              </div>

              {/* Blocked u/s 17(5) */}
              <div className="bg-slate-800/80 p-4 rounded-xl border border-rose-900/30">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1">
                  <span className="text-rose-300">Blocked Credit u/s 17(5)</span>
                  <span className="text-rose-400 font-mono font-bold">{formatINR(metrics.ineligibleITC)}</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all"
                    style={{
                      width: `${
                        metrics.totalBooksITC > 0
                          ? Math.min(100, (metrics.ineligibleITC / metrics.totalBooksITC) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Ineligible motor vehicles, food & beverages, gifts, etc. Reversible in Table 4(B)(1).
                </span>
              </div>
            </div>
          </div>

          {/* Net Claimable Summary */}
          <div className="mt-6 pt-4 border-t border-slate-800 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">
              Net Claimable ITC in GSTR-3B
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
              {formatINR(metrics.netClaimableITC)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              (Matched ITC minus Ineligible 17(5) credits)
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Recommendations Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-5 rounded-2xl border border-amber-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-200">
              Tax Auditor Action Needed ({metrics.unresolvedCount} Pending Cases)
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              {metrics.missingIn2BCount > 0 &&
                `Send automated GSTR-1 reminders for ₹${formatINR(metrics.missingIn2BITC)} unfiled vendor ITC. `}
              {metrics.mismatchCount > 0 &&
                `Review ₹${formatINR(metrics.mismatchITC)} rate mismatch disputes. `}
              {metrics.duplicateCount > 0 && `Resolve ${metrics.duplicateCount} duplicate invoice warnings.`}
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('reconciliation')}
          className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/40 transition whitespace-nowrap"
        >
          Review Reconciliation Items &rarr;
        </button>
      </div>
    </div>
  );
};
