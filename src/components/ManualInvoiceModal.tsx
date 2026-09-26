import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { DocumentType, ITCEligibility, LineItem, Organization, PurchaseInvoice } from '../types';
import { INDIAN_STATES, isInterStateSupply, validateGSTIN, validateInvoiceNumber, validatePurchaseInvoice } from '../utils/gstValidation';

interface ManualInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoice: Partial<PurchaseInvoice>) => void;
  organization: Organization;
  initialInvoice?: PurchaseInvoice | null;
}

export const ManualInvoiceModal: React.FC<ManualInvoiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  organization,
  initialInvoice,
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [documentType, setDocumentType] = useState<DocumentType>('INV');
  const [placeOfSupply, setPlaceOfSupply] = useState(organization.stateCode);
  const [hsnSac, setHsnSac] = useState('8471');
  const [itcEligibility, setItcEligibility] = useState<ITCEligibility>('ELIGIBLE');
  const [notes, setNotes] = useState('');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: 'li_init_1',
      description: 'Standard IT / Business Supplies',
      hsnSac: '8471',
      quantity: 1,
      unit: 'NOS',
      unitRate: 10000,
      taxableValue: 10000,
      gstRate: 18,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 11800,
    },
  ]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (initialInvoice) {
      setSupplierName(initialInvoice.supplierName);
      setSupplierGstin(initialInvoice.supplierGstin);
      setSupplierAddress(initialInvoice.supplierAddress || '');
      setInvoiceNumber(initialInvoice.invoiceNumber);
      setInvoiceDate(initialInvoice.invoiceDate);
      setDocumentType(initialInvoice.documentType);
      setPlaceOfSupply(initialInvoice.placeOfSupply);
      setHsnSac(initialInvoice.hsnSac || '8471');
      setItcEligibility(initialInvoice.itcEligibility);
      setNotes(initialInvoice.notes || '');
      if (initialInvoice.lineItems && initialInvoice.lineItems.length > 0) {
        setLineItems(initialInvoice.lineItems);
      }
    } else {
      // Reset form
      setSupplierName('');
      setSupplierGstin('');
      setSupplierAddress('');
      setInvoiceNumber(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDocumentType('INV');
      setPlaceOfSupply(organization.stateCode);
      setHsnSac('8471');
      setItcEligibility('ELIGIBLE');
      setNotes('');
      setLineItems([
        {
          id: 'li_init_1',
          description: 'Standard Business Supplies',
          hsnSac: '8471',
          quantity: 1,
          unit: 'NOS',
          unitRate: 10000,
          taxableValue: 10000,
          gstRate: 18,
          cgstAmount: 900,
          sgstAmount: 900,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 11800,
        },
      ]);
    }
  }, [initialInvoice, isOpen, organization.stateCode]);

  // Derived totals
  const totalTaxable = lineItems.reduce((sum, item) => sum + (Number(item.taxableValue) || 0), 0);
  const totalCgst = lineItems.reduce((sum, item) => sum + (Number(item.cgstAmount) || 0), 0);
  const totalSgst = lineItems.reduce((sum, item) => sum + (Number(item.sgstAmount) || 0), 0);
  const totalIgst = lineItems.reduce((sum, item) => sum + (Number(item.igstAmount) || 0), 0);
  const totalCess = lineItems.reduce((sum, item) => sum + (Number(item.cessAmount) || 0), 0);
  const totalInvoiceAmount = totalTaxable + totalCgst + totalSgst + totalIgst + totalCess;

  const isInterState = isInterStateSupply(organization.gstin, supplierGstin, placeOfSupply);

  // Recalculate line item taxes when parameters change
  const updateLineItem = (index: number, updates: Partial<LineItem>) => {
    const updated = [...lineItems];
    const current = { ...updated[index], ...updates };

    // If quantity or rate changed, recompute taxable value
    if ('quantity' in updates || 'unitRate' in updates) {
      current.taxableValue = (Number(current.quantity) || 0) * (Number(current.unitRate) || 0);
    }

    const taxable = Number(current.taxableValue) || 0;
    const rate = Number(current.gstRate) || 0;
    const taxTotal = (taxable * rate) / 100;

    if (isInterState) {
      current.igstAmount = Math.round(taxTotal * 100) / 100;
      current.cgstAmount = 0;
      current.sgstAmount = 0;
    } else {
      const halfTax = Math.round((taxTotal / 2) * 100) / 100;
      current.cgstAmount = halfTax;
      current.sgstAmount = halfTax;
      current.igstAmount = 0;
    }

    current.totalAmount = taxable + current.cgstAmount + current.sgstAmount + current.igstAmount + (Number(current.cessAmount) || 0);
    updated[index] = current;
    setLineItems(updated);
  };

  const addLineItem = () => {
    const newItem: LineItem = {
      id: `li_${Date.now()}_${lineItems.length}`,
      description: 'Additional Material / Service',
      hsnSac: hsnSac || '8471',
      quantity: 1,
      unit: 'NOS',
      unitRate: 5000,
      taxableValue: 5000,
      gstRate: 18,
      cgstAmount: isInterState ? 0 : 450,
      sgstAmount: isInterState ? 0 : 450,
      igstAmount: isInterState ? 900 : 0,
      cessAmount: 0,
      totalAmount: 5900,
    };
    setLineItems([...lineItems, newItem]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Run live validation whenever critical fields change
  useEffect(() => {
    const candidate: Partial<PurchaseInvoice> = {
      id: initialInvoice?.id,
      supplierName,
      supplierGstin,
      invoiceNumber,
      invoiceDate,
      documentType,
      placeOfSupply,
      taxableValue: totalTaxable,
      cgstAmount: totalCgst,
      sgstAmount: totalSgst,
      igstAmount: totalIgst,
      cessAmount: totalCess,
      totalAmount: totalInvoiceAmount,
    };

    const result = validatePurchaseInvoice(candidate, organization.gstin);
    setValidationErrors(result.errors);
    setValidationWarnings(result.warnings);
  }, [
    supplierName,
    supplierGstin,
    invoiceNumber,
    invoiceDate,
    documentType,
    placeOfSupply,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalInvoiceAmount,
    organization.gstin,
    initialInvoice?.id,
  ]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invoicePayload: Partial<PurchaseInvoice> = {
      ...(initialInvoice || {}),
      supplierName: supplierName.trim(),
      supplierGstin: supplierGstin.trim().toUpperCase(),
      supplierAddress: supplierAddress.trim(),
      invoiceNumber: invoiceNumber.trim().toUpperCase(),
      invoiceDate,
      documentType,
      placeOfSupply,
      taxableValue: totalTaxable,
      cgstAmount: totalCgst,
      sgstAmount: totalSgst,
      igstAmount: totalIgst,
      cessAmount: totalCess,
      totalAmount: totalInvoiceAmount,
      hsnSac,
      lineItems,
      itcEligibility,
      notes,
      status: validationErrors.length > 0 ? 'FLAGGED' : 'APPROVED',
      confidenceScores: {
        supplierGSTIN: 1.0,
        supplierName: 1.0,
        invoiceNumber: 1.0,
        invoiceDate: 1.0,
        taxableValue: 1.0,
        totalAmount: 1.0,
      },
    };

    onSave(invoicePayload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FilePlus2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {initialInvoice ? 'Edit Purchase Invoice' : 'New Purchase Invoice Entry'}
              </h3>
              <p className="text-xs text-slate-400">
                GST compliant voucher entry with real-time tax validation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Validation alerts */}
          {validationErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs space-y-1">
              <div className="flex items-center space-x-2 font-bold text-rose-300 mb-1">
                <AlertCircle className="w-4 h-4" />
                <span>GST Validation Errors Detected:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validationWarnings.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs space-y-0.5">
              <div className="font-semibold text-amber-300">Statutory Warnings:</div>
              {validationWarnings.map((warn, i) => (
                <div key={i}>• {warn}</div>
              ))}
            </div>
          )}

          {/* Top Grid: Supplier & Document Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Supplier GSTIN */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supplier GSTIN <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={15}
                value={supplierGstin}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setSupplierGstin(val);
                  if (val.length >= 2) {
                    const stateCode = val.substring(0, 2);
                    if (INDIAN_STATES[stateCode]) {
                      setPlaceOfSupply(stateCode);
                    }
                  }
                }}
                placeholder="27AAACT2727Q1ZB"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {supplierGstin.length === 15 && (
                <span className="text-[11px] text-emerald-400 mt-1 block">
                  State: {INDIAN_STATES[supplierGstin.substring(0, 2)] || 'Unknown'} (
                  {isInterState ? 'Inter-state / IGST' : 'Intra-state / CGST+SGST'})
                </span>
              )}
            </div>

            {/* Supplier Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supplier Legal Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Tata Steel Limited"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Document Type <span className="text-rose-400">*</span>
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="INV">Tax Invoice (INV)</option>
                <option value="CRN">Credit Note (CRN - Reversal/Discount)</option>
                <option value="DBN">Debit Note (DBN - Additional Tax)</option>
              </select>
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Invoice Number <span className="text-rose-400">*</span> (max 16 chars)
              </label>
              <input
                type="text"
                required
                maxLength={16}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="TS/2024/091"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Invoice Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* ITC Eligibility */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ITC Eligibility (Sec 16 & 17)
              </label>
              <select
                value={itcEligibility}
                onChange={(e) => setItcEligibility(e.target.value as ITCEligibility)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ELIGIBLE">Eligible (Normal ITC)</option>
                <option value="INELIGIBLE_17_5">Blocked u/s 17(5) (Vehicles, Food, etc.)</option>
                <option value="PENDING">Pending Audit Determination</option>
              </select>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-white">Line Items Breakdown</h4>
                <p className="text-xs text-slate-400">
                  Item details with HSN codes and statutory GST rate calculations
                </p>
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                    <div className="sm:col-span-3">
                      <label className="text-[11px] text-slate-400 font-medium">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                        placeholder="Item description"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-[11px] text-slate-400 font-medium">HSN/SAC</label>
                      <input
                        type="text"
                        value={item.hsnSac}
                        onChange={(e) => updateLineItem(idx, { hsnSac: e.target.value })}
                        placeholder="8471"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-[11px] text-slate-400 font-medium">Qty</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-end justify-between">
                      <div className="w-full">
                        <label className="text-[11px] text-slate-400 font-medium">Unit Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.unitRate}
                          onChange={(e) => updateLineItem(idx, { unitRate: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="ml-2 mb-1 p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-700 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-700/40 text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Taxable Value</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        ₹{item.taxableValue.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">GST Rate</span>
                      <select
                        value={item.gstRate}
                        onChange={(e) => updateLineItem(idx, { gstRate: Number(e.target.value) })}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>

                    {isInterState ? (
                      <div>
                        <span className="text-slate-400 text-[11px] block">IGST</span>
                        <span className="font-mono text-indigo-300 font-semibold">
                          ₹{item.igstAmount.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-400 text-[11px] block">CGST</span>
                          <span className="font-mono text-emerald-300 font-semibold">
                            ₹{item.cgstAmount.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">SGST</span>
                          <span className="font-mono text-emerald-300 font-semibold">
                            ₹{item.sgstAmount.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="text-right">
                      <span className="text-slate-400 text-[11px] block">Total Item Amount</span>
                      <span className="font-mono text-white font-bold">
                        ₹{item.totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mathematical Totals Summary Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Taxable Amount</span>
              <div className="text-base font-bold font-mono text-white">₹{totalTaxable.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">CGST + SGST</span>
              <div className="text-base font-bold font-mono text-emerald-300">
                ₹{(totalCgst + totalSgst).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">IGST</span>
              <div className="text-base font-bold font-mono text-indigo-300">₹{totalIgst.toFixed(2)}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Total Invoice Value</span>
              <div className="text-lg font-black font-mono text-emerald-400">
                ₹{totalInvoiceAmount.toFixed(2)}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <div className="text-xs text-slate-400">
            {validationErrors.length === 0 ? (
              <span className="flex items-center text-emerald-400 space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Invoice passed all mathematical & GST statutory checks.</span>
              </span>
            ) : (
              <span className="text-rose-400 font-medium">
                {validationErrors.length} validation errors must be reviewed.
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/30 transition"
            >
              {initialInvoice ? 'Save Changes' : 'Commit to Purchase Register'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
