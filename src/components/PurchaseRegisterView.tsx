import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { DocumentType, InvoiceStatus, ITCEligibility, Organization, PurchaseInvoice, UserRole } from '../types';
import { exportInvoicesToCSV, exportInvoicesToExcel } from '../services/excelService';

interface PurchaseRegisterViewProps {
  invoices: PurchaseInvoice[];
  organization: Organization;
  userRole?: UserRole;
  onAddInvoice: () => void;
  onEditInvoice: (invoice: PurchaseInvoice) => void;
  onDeleteInvoice: (invoiceId: string) => void;
}

export const PurchaseRegisterView: React.FC<PurchaseRegisterViewProps> = ({
  invoices,
  organization,
  userRole = 'ADMIN',
  onAddInvoice,
  onEditInvoice,
  onDeleteInvoice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [itcFilter, setItcFilter] = useState<string>('ALL');
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<PurchaseInvoice | null>(null);

  // Filtered list
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search term
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchName = inv.supplierName?.toLowerCase().includes(query);
        const matchGstin = inv.supplierGstin?.toLowerCase().includes(query);
        const matchInvNo = inv.invoiceNumber?.toLowerCase().includes(query);
        if (!matchName && !matchGstin && !matchInvNo) return false;
      }

      // Doc Type
      if (docTypeFilter !== 'ALL' && inv.documentType !== docTypeFilter) {
        return false;
      }

      // Status
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) {
        return false;
      }

      // ITC
      if (itcFilter !== 'ALL' && inv.itcEligibility !== itcFilter) {
        return false;
      }

      return true;
    });
  }, [invoices, searchTerm, docTypeFilter, statusFilter, itcFilter]);

  // Aggregate totals of filtered list
  const totals = useMemo(() => {
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let total = 0;

    filteredInvoices.forEach((inv) => {
      const multiplier = inv.documentType === 'CRN' ? -1 : 1;
      taxable += inv.taxableValue * multiplier;
      cgst += inv.cgstAmount * multiplier;
      sgst += inv.sgstAmount * multiplier;
      igst += inv.igstAmount * multiplier;
      total += inv.totalAmount * multiplier;
    });

    return { taxable, cgst, sgst, igst, itc: cgst + sgst + igst, total };
  }, [filteredInvoices]);

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <span>Purchase Register</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {filteredInvoices.length} entries
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Complete inward supply register with credit/debit notes and statutory GST compliance
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-2">
          {/* Export to Excel */}
          <button
            onClick={() => exportInvoicesToExcel(filteredInvoices)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </button>

          {/* Export to CSV */}
          <button
            onClick={() => exportInvoicesToCSV(filteredInvoices)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>CSV</span>
          </button>

          {/* Add Manual Invoice */}
          <button
            onClick={onAddInvoice}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vendor, GSTIN, invoice #..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto">
          {/* Doc Type */}
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Documents</option>
            <option value="INV">Invoices (INV)</option>
            <option value="CRN">Credit Notes (CRN)</option>
            <option value="DBN">Debit Notes (DBN)</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="FLAGGED">Flagged / Errors</option>
          </select>

          {/* ITC Eligibility */}
          <select
            value={itcFilter}
            onChange={(e) => setItcFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All ITC Types</option>
            <option value="ELIGIBLE">Eligible ITC</option>
            <option value="INELIGIBLE_17_5">Blocked u/s 17(5)</option>
          </select>
        </div>
      </div>

      {/* Summary strip of active filtered view */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl text-xs">
        <div>
          <span className="text-slate-400 block font-medium">Net Taxable Value</span>
          <span className="text-sm font-bold text-white font-mono">{formatINR(totals.taxable)}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Net CGST + SGST</span>
          <span className="text-sm font-bold text-emerald-300 font-mono">
            {formatINR(totals.cgst + totals.sgst)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Net IGST</span>
          <span className="text-sm font-bold text-indigo-300 font-mono">{formatINR(totals.igst)}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-medium">Total Books Value (with Cess)</span>
          <span className="text-sm font-black text-emerald-400 font-mono">{formatINR(totals.total)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-700/80">
              <tr>
                <th className="py-3.5 px-4">Doc Details</th>
                <th className="py-3.5 px-4">Supplier / GSTIN</th>
                <th className="py-3.5 px-4 text-right">Taxable (₹)</th>
                <th className="py-3.5 px-4 text-right">CGST + SGST</th>
                <th className="py-3.5 px-4 text-right">IGST (₹)</th>
                <th className="py-3.5 px-4 text-right">Total (₹)</th>
                <th className="py-3.5 px-4 text-center">ITC Eligibility</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    No purchase invoices found matching current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isCrn = inv.documentType === 'CRN';
                  const isDbn = inv.documentType === 'DBN';
                  const isBlocked = inv.itcEligibility === 'INELIGIBLE_17_5';

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedInvoiceForView(inv)}
                    >
                      {/* Doc Details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                              isCrn
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : isDbn
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {inv.documentType}
                          </span>
                          <span className="font-bold text-white font-mono">{inv.invoiceNumber}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {inv.invoiceDate}
                        </span>
                      </td>

                      {/* Supplier */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <div className="font-semibold text-slate-200 truncate">{inv.supplierName}</div>
                        <div className="font-mono text-[11px] text-emerald-400 mt-0.5">
                          {inv.supplierGstin}
                        </div>
                      </td>

                      {/* Taxable */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-200">
                        {isCrn ? '-' : ''}₹{inv.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* CGST + SGST */}
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-medium">
                        {inv.cgstAmount + inv.sgstAmount > 0 ? (
                          <>
                            {isCrn ? '-' : ''}₹{(inv.cgstAmount + inv.sgstAmount).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                            })}
                          </>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* IGST */}
                      <td className="py-3.5 px-4 text-right font-mono text-indigo-300 font-medium">
                        {inv.igstAmount > 0 ? (
                          <>
                            {isCrn ? '-' : ''}₹{inv.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {isCrn ? '-' : ''}₹{inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* ITC Eligibility */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isBlocked
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                          }`}
                        >
                          {isBlocked ? 'Blocked 17(5)' : 'Eligible'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {inv.validationErrors && inv.validationErrors.length > 0 ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-800">
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            <span>Flagged</span>
                          </span>
                        ) : inv.status === 'APPROVED' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Approved</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-4 text-right space-x-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onEditInvoice(inv)}
                          title="Edit Invoice"
                          aria-label={`Edit invoice ${inv.invoiceNumber}`}
                          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteInvoice(inv.id);
                          }}
                          title={userRole !== 'ADMIN' ? 'Admin role required to delete invoice' : 'Delete Invoice'}
                          aria-label={`Delete invoice ${inv.invoiceNumber}`}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Quick Detail Drawer / Modal */}
      {selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs uppercase font-bold text-emerald-400 font-mono">
                  {selectedInvoiceForView.documentType} • {selectedInvoiceForView.invoiceNumber}
                </span>
                <h3 className="text-lg font-bold text-white">{selectedInvoiceForView.supplierName}</h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForView(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-800/40 p-3 rounded-xl">
              <div>
                <span className="text-slate-400">Supplier GSTIN:</span>
                <div className="font-mono text-emerald-300 font-semibold">{selectedInvoiceForView.supplierGstin}</div>
              </div>
              <div>
                <span className="text-slate-400">Invoice Date:</span>
                <div className="font-semibold text-white">{selectedInvoiceForView.invoiceDate}</div>
              </div>
              <div>
                <span className="text-slate-400">ITC Status:</span>
                <div className="font-semibold text-white">{selectedInvoiceForView.itcEligibility}</div>
              </div>
              <div>
                <span className="text-slate-400">Place of Supply:</span>
                <div className="font-semibold text-white">{selectedInvoiceForView.placeOfSupply}</div>
              </div>
            </div>

            {/* Line items */}
            {selectedInvoiceForView.lineItems && selectedInvoiceForView.lineItems.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Line Items ({selectedInvoiceForView.lineItems.length})
                </h4>
                <div className="space-y-2">
                  {selectedInvoiceForView.lineItems.map((li, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-white">{li.description}</div>
                        <div className="text-slate-400 text-[11px]">
                          HSN: {li.hsnSac || 'N/A'} • Qty: {li.quantity} • Rate: ₹{li.unitRate} • GST: {li.gstRate}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white font-mono">₹{li.totalAmount.toFixed(2)}</div>
                        <div className="text-[11px] text-emerald-400 font-mono">
                          Tax: ₹{(li.cgstAmount + li.sgstAmount + li.igstAmount).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings or errors */}
            {selectedInvoiceForView.validationErrors && selectedInvoiceForView.validationErrors.length > 0 && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300">
                <span className="font-bold block mb-1">Validation Errors:</span>
                {selectedInvoiceForView.validationErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const id = selectedInvoiceForView.id;
                  setSelectedInvoiceForView(null);
                  onDeleteInvoice(id);
                }}
                className="px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 font-semibold text-xs rounded-lg transition flex items-center space-x-1.5"
                title={userRole !== 'ADMIN' ? 'Admin role required to delete' : 'Delete Invoice'}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Invoice</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onEditInvoice(selectedInvoiceForView);
                  setSelectedInvoiceForView(null);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition"
              >
                Edit Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
