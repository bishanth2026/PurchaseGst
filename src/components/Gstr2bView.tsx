import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import { GSTR2BRecord, Organization } from '../types';
import { parseGSTR2BFile } from '../services/excelService';
import { InvoiceService } from '../services/invoiceService';
import { BENCHMARK_GSTR2B_RECORDS } from '../utils/testDatasets';
import { getGstr2bReturnPeriod, isInReturnPeriod } from '../utils/returnPeriod';

interface Gstr2bViewProps {
  records: GSTR2BRecord[];
  organization: Organization;
  onImportComplete: () => void;
}

export const Gstr2bView: React.FC<Gstr2bViewProps> = ({
  records,
  organization,
  onImportComplete,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportMessage(null);

    try {
      let parsed: GSTR2BRecord[] = [];
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        parsed = parseGSTR2BFile(text, file.name, organization.id, organization.currentReturnPeriod);
      } else {
        const buffer = await file.arrayBuffer();
        parsed = parseGSTR2BFile(buffer, file.name, organization.id, organization.currentReturnPeriod);
      }

      InvoiceService.addGSTR2BRecords(parsed);
      setImportMessage(`Successfully imported ${parsed.length} GSTR-2B records from ${file.name}`);
      onImportComplete();
    } catch (err: any) {
      console.error('Failed to parse GSTR-2B file:', err);
      setImportMessage(`Import error: ${err.message || 'Invalid file format'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const loadOfficialSample = () => {
    InvoiceService.saveGSTR2BRecords(BENCHMARK_GSTR2B_RECORDS);
    setImportMessage(`Loaded official GST portal benchmark GSTR-2B statement (${BENCHMARK_GSTR2B_RECORDS.length} entries).`);
    onImportComplete();
  };

  const filtered = records.filter((r) => {
    if (!isInReturnPeriod(getGstr2bReturnPeriod(r), organization.currentReturnPeriod)) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.supplierName.toLowerCase().includes(q) ||
      r.supplierGstin.toLowerCase().includes(q) ||
      r.invoiceNumber.toLowerCase().includes(q)
    );
  });

  const totals = filtered.reduce(
    (acc, r) => {
      const mul = r.documentType === 'CRN' ? -1 : 1;
      acc.taxable += r.taxableValue * mul;
      acc.cgst += r.cgstAmount * mul;
      acc.sgst += r.sgstAmount * mul;
      acc.igst += r.igstAmount * mul;
      acc.total += r.invoiceValue * mul;
      return acc;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );

  const formatINR = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <span>GSTR-2B Statement Ledger</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono">
              Period: {organization.currentReturnPeriod}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Auto-drafted static ITC statement generated from counterparty supplier GSTR-1 / IFF filings.
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.json,.csv"
            className="hidden"
          />

          <button
            onClick={loadOfficialSample}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Load Benchmark 2B Statement</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition"
          >
            <FileUp className="w-4 h-4" />
            <span>{isImporting ? 'Parsing File...' : 'Upload GSTR-2B (Excel/JSON)'}</span>
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{importMessage}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs">
        <div>
          <span className="text-slate-400 block font-medium">GSTR-2B Taxable</span>
          <span className="text-sm font-bold text-white font-mono">{formatINR(totals.taxable)}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">CGST + SGST (Intra)</span>
          <span className="text-sm font-bold text-emerald-300 font-mono">
            {formatINR(totals.cgst + totals.sgst)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">IGST (Inter-state)</span>
          <span className="text-sm font-bold text-indigo-300 font-mono">{formatINR(totals.igst)}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Total Eligible ITC in 2B</span>
          <span className="text-sm font-black text-emerald-400 font-mono">
            {formatINR(totals.cgst + totals.sgst + totals.igst)}
          </span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search 2B by Supplier, GSTIN, Invoice #..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} records</span>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-700/80">
              <tr>
                <th className="py-3.5 px-4">Doc Type & No</th>
                <th className="py-3.5 px-4">Supplier / Trade Name</th>
                <th className="py-3.5 px-4">Filing Date</th>
                <th className="py-3.5 px-4 text-right">Taxable (₹)</th>
                <th className="py-3.5 px-4 text-right">CGST + SGST</th>
                <th className="py-3.5 px-4 text-right">IGST (₹)</th>
                <th className="py-3.5 px-4 text-right">Invoice Val (₹)</th>
                <th className="py-3.5 px-4 text-center">ITC Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    No GSTR-2B records found. Upload a statement or load the benchmark suite.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => {
                  const isCrn = rec.documentType === 'CRN';
                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                              isCrn
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {rec.documentType}
                          </span>
                          <span className="font-bold text-white font-mono">{rec.invoiceNumber}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">{rec.invoiceDate}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{rec.supplierName}</div>
                        <div className="font-mono text-[11px] text-emerald-400 mt-0.5">
                          {rec.supplierGstin}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 font-mono">
                        {rec.filingDate || '2024-05-11'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-200">
                        {isCrn ? '-' : ''}₹{rec.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-medium">
                        {rec.cgstAmount + rec.sgstAmount > 0 ? (
                          <>
                            {isCrn ? '-' : ''}₹{(rec.cgstAmount + rec.sgstAmount).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                            })}
                          </>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-indigo-300 font-medium">
                        {rec.igstAmount > 0 ? (
                          <>
                            {isCrn ? '-' : ''}₹{rec.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {isCrn ? '-' : ''}₹{rec.invoiceValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            rec.itcAvailable
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {rec.itcAvailable ? 'Available' : 'Ineligible'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
