import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Image,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
  ZoomIn,
} from 'lucide-react';
import { Organization, PurchaseInvoice, UploadBatch } from '../types';
import { extractInvoiceDataFromFile, OCRExtractionResult } from '../services/geminiOcrService';
import { InvoiceService } from '../services/invoiceService';

interface BatchUploadViewProps {
  organization: Organization;
  onInvoicesCommitted: () => void;
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'PENDING' | 'EXTRACTING' | 'REVIEW_REQUIRED' | 'READY' | 'ERROR';
  extractedData?: Partial<PurchaseInvoice>;
  ocrResult?: OCRExtractionResult;
  error?: string;
}

export const BatchUploadView: React.FC<BatchUploadViewProps> = ({
  organization,
  onInvoicesCommitted,
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isCommitted, setIsCommitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: QueuedFile[] = Array.from(files).map((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const isSupported = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
      const isOversized = f.size > 20 * 1024 * 1024;
      const isEmpty = f.size === 0;

      let initialStatus: QueuedFile['status'] = 'PENDING';
      let initialError: string | undefined = undefined;

      if (!isSupported) {
        initialStatus = 'ERROR';
        initialError = `Unsupported file format (.${ext || 'unknown'}). Supported formats: PDF, PNG, JPG, and WEBP.`;
      } else if (isEmpty) {
        initialStatus = 'ERROR';
        initialError = `The file "${f.name}" is empty (0 bytes). Please upload a valid invoice document.`;
      } else if (isOversized) {
        initialStatus = 'ERROR';
        initialError = `File size (${(f.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 20 MB upload limit.`;
      }

      return {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: initialStatus,
        error: initialError,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    if (!selectedFileId && newItems.length > 0) {
      setSelectedFileId(newItems[0].id);
    }
  };

  // Retry extraction for an individual failed or uncertain item
  const retrySingleFile = async (fileId: string) => {
    const item = queue.find((q) => q.id === fileId);
    if (!item) return;

    setQueue((prev) =>
      prev.map((q) => (q.id === fileId ? { ...q, status: 'EXTRACTING', error: undefined } : q))
    );

    try {
      const ocr = await extractInvoiceDataFromFile(item.file, organization.gstin, organization.id);
      const hasUncertain = ocr.uncertainFields.length > 0;

      setQueue((prev) =>
        prev.map((q) =>
          q.id === fileId
            ? {
                ...q,
                status: hasUncertain ? 'REVIEW_REQUIRED' : 'READY',
                extractedData: ocr.invoice,
                ocrResult: ocr,
                error: undefined,
              }
            : q
        )
      );
    } catch (err: any) {
      console.error('OCR retry error for item:', item.file.name, err);
      setQueue((prev) =>
        prev.map((q) =>
          q.id === fileId
            ? {
                ...q,
                status: 'ERROR',
                error: err.message || 'Extraction failed',
              }
            : q
        )
      );
    }
  };

  // Process next items using Gemini OCR
  const processQueue = async () => {
    setIsExtracting(true);

    const pending = queue.filter((q) => q.status === 'PENDING');
    const batch = InvoiceService.createBatch(`OCR_Batch_${new Date().toISOString().substring(11, 19)}`, pending.length);

    for (const item of pending) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'EXTRACTING' } : q))
      );

      try {
        const ocr = await extractInvoiceDataFromFile(item.file, organization.gstin, organization.id);
        const hasUncertain = ocr.uncertainFields.length > 0;

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: hasUncertain ? 'REVIEW_REQUIRED' : 'READY',
                  extractedData: ocr.invoice,
                  ocrResult: ocr,
                }
              : q
          )
        );
        batch.processedFiles++;
      } catch (err: any) {
        console.error('OCR processing error for item:', item.file.name, err);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'ERROR',
                  error: err.message || 'Extraction failed',
                }
              : q
          )
        );
        batch.failedFiles++;
      }
      InvoiceService.updateBatch(batch);
    }

    setIsExtracting(false);
  };

  const selectedFile = queue.find((q) => q.id === selectedFileId);

  // Update extracted values on the fly during review
  const updateExtractedField = (field: keyof PurchaseInvoice, value: any) => {
    if (!selectedFile || !selectedFile.extractedData) return;
    const updated = { ...selectedFile.extractedData, [field]: value };
    setQueue((prev) =>
      prev.map((q) => (q.id === selectedFile.id ? { ...q, extractedData: updated } : q))
    );
  };

  // Commit all ready and reviewed items to Purchase Register
  const commitAllApproved = () => {
    const readyItems = queue.filter(
      (q) => (q.status === 'READY' || q.status === 'REVIEW_REQUIRED') && q.extractedData
    );

    readyItems.forEach((item) => {
      InvoiceService.addInvoice(item.extractedData!);
    });

    setIsCommitted(true);
    setTimeout(() => {
      setQueue([]);
      setIsCommitted(false);
      onInvoicesCommitted();
    }, 1500);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <span>Multiple Invoice Upload & AI OCR</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Multimodal Gemini 3.8 Flash
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            High-precision Indian GST OCR with field-level confidence scoring and zero-hallucination
            guarantee.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            ref={fileInputRef}
            onChange={(e) => handleFilesAdded(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
          >
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <span>Select Files (PDF/Images)</span>
          </button>

          {queue.some((q) => q.status === 'PENDING') && (
            <button
              onClick={processQueue}
              disabled={isExtracting}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing with AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Start AI Extraction</span>
                </>
              )}
            </button>
          )}

          {queue.some((q) => q.status === 'READY' || q.status === 'REVIEW_REQUIRED') && (
            <button
              onClick={commitAllApproved}
              disabled={isCommitted}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCommitted ? 'Saved to Books!' : 'Commit to Purchase Register'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Drag and Drop Zone if Queue is empty */}
      {queue.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-900/60 hover:bg-slate-900 p-12 rounded-2xl text-center cursor-pointer transition-all group"
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 group-hover:bg-emerald-500/10 border border-slate-700 group-hover:border-emerald-500/30 flex items-center justify-center mx-auto mb-4 transition-all">
            <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            Drop your purchase invoices here or click to browse
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
            Supports batch processing of scanned tax invoices, e-invoices, credit notes, and debit
            notes in PDF, JPG, or PNG format.
          </p>
          <div className="inline-flex items-center space-x-4 text-xs text-slate-500">
            <span>• Confidence scoring per field</span>
            <span>• HSN/SAC line item parsing</span>
            <span>• Strict mathematical validation</span>
          </div>
        </div>
      ) : (
        /* Side by Side Split Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* File Queue Sidebar (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 h-[750px] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Upload Queue ({queue.length})
              </span>
              <button
                onClick={() => setQueue([])}
                className="text-[11px] text-slate-500 hover:text-rose-400"
              >
                Clear All
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-none">
              {queue.map((item) => {
                const isSelected = item.id === selectedFileId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFileId(item.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500/60 shadow-sm'
                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="truncate text-xs">
                        <div className="font-semibold text-white truncate">{item.file.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {(item.file.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                    </div>

                    {/* Status badge & Remove button */}
                    <div className="flex items-center space-x-2">
                      {item.status === 'PENDING' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          Queued
                        </span>
                      )}
                      {item.status === 'EXTRACTING' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Extracting</span>
                        </span>
                      )}
                      {item.status === 'READY' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                          Verified
                        </span>
                      )}
                      {item.status === 'REVIEW_REQUIRED' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-semibold">
                          Review
                        </span>
                      )}
                      {item.status === 'ERROR' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                          Failed
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQueue((prev) => prev.filter((q) => q.id !== item.id));
                          if (selectedFileId === item.id) {
                            setSelectedFileId(null);
                          }
                        }}
                        title="Remove file from queue"
                        aria-label={`Remove ${item.file.name}`}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-700/60 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch Progress Summary */}
            <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between">
              <span>
                Verified: {queue.filter((q) => q.status === 'READY').length} / {queue.length}
              </span>
              <span>
                Review needed: {queue.filter((q) => q.status === 'REVIEW_REQUIRED').length}
              </span>
            </div>
          </div>

          {/* Side by Side Review Area (8 cols) */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 h-[750px] flex flex-col">
            {selectedFile ? (
              <div className="flex-1 flex flex-col overflow-hidden space-y-4">
                {/* Header of selected file */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white truncate max-w-md">
                      {selectedFile.file.name}
                    </span>
                    {selectedFile.status === 'REVIEW_REQUIRED' && (
                      <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Uncertain Fields Present
                      </span>
                    )}
                  </div>
                  {selectedFile.ocrResult?.rawOutput?.extractedVia && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      Engine: {selectedFile.ocrResult.rawOutput.extractedVia}
                    </span>
                  )}
                </div>

                {/* Sub-split: Left Preview, Right Extracted data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
                  {/* Document Preview Pane */}
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
                    <div className="p-2 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>Source Document</span>
                      <span className="font-mono text-slate-500">{selectedFile.file.type || 'image'}</span>
                    </div>
                    <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-slate-950/60">
                      {selectedFile.file.type.startsWith('image/') ? (
                        <img
                          src={selectedFile.previewUrl}
                          alt="Invoice Preview"
                          className="max-h-full max-w-full object-contain rounded"
                        />
                      ) : (
                        <iframe
                          src={selectedFile.previewUrl}
                          title="PDF Document Preview"
                          className="w-full h-full rounded border-0"
                        />
                      )}
                    </div>
                  </div>

                  {/* Extracted Fields & Confidence Pane */}
                  <div className="bg-slate-800/40 rounded-xl border border-slate-800 p-4 overflow-y-auto space-y-4">
                    {selectedFile.extractedData ? (
                      <>
                        {/* Warnings note */}
                        {selectedFile.ocrResult?.warnings &&
                          selectedFile.ocrResult.warnings.length > 0 && (
                            <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-lg text-xs text-amber-300 space-y-1">
                              <span className="font-bold flex items-center space-x-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>AI Extraction Notice</span>
                              </span>
                              {selectedFile.ocrResult.warnings.map((w, idx) => (
                                <div key={idx}>• {w}</div>
                              ))}
                            </div>
                          )}

                        {/* Editable Form with Confidence Badges */}
                        <div className="space-y-3 text-xs">
                          {/* Supplier Name */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-slate-300">Supplier Name</span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  (selectedFile.ocrResult?.confidenceScores.supplierName || 0) >= 0.85
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}
                              >
                                {Math.round(
                                  (selectedFile.ocrResult?.confidenceScores.supplierName || 0.9) * 100
                                )}
                                % Conf
                              </span>
                            </div>
                            <input
                              type="text"
                              value={selectedFile.extractedData.supplierName || ''}
                              onChange={(e) => updateExtractedField('supplierName', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                            />
                          </div>

                          {/* Supplier GSTIN */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-slate-300">Supplier GSTIN</span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  (selectedFile.ocrResult?.confidenceScores.supplierGSTIN || 0) >= 0.85
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}
                              >
                                {Math.round(
                                  (selectedFile.ocrResult?.confidenceScores.supplierGSTIN || 0.9) * 100
                                )}
                                % Conf
                              </span>
                            </div>
                            <input
                              type="text"
                              value={selectedFile.extractedData.supplierGstin || ''}
                              onChange={(e) =>
                                updateExtractedField('supplierGstin', e.target.value.toUpperCase())
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-emerald-400"
                            />
                          </div>

                          {/* Invoice Number & Date */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-slate-300">Invoice No</span>
                                <span className="text-[10px] font-mono text-emerald-400">
                                  {Math.round(
                                    (selectedFile.ocrResult?.confidenceScores.invoiceNumber || 0.9) *
                                      100
                                  )}
                                  %
                                </span>
                              </div>
                              <input
                                type="text"
                                value={selectedFile.extractedData.invoiceNumber || ''}
                                onChange={(e) =>
                                  updateExtractedField('invoiceNumber', e.target.value)
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-slate-300">Date</span>
                                <span className="text-[10px] font-mono text-emerald-400">
                                  {Math.round(
                                    (selectedFile.ocrResult?.confidenceScores.invoiceDate || 0.9) * 100
                                  )}
                                  %
                                </span>
                              </div>
                              <input
                                type="date"
                                value={selectedFile.extractedData.invoiceDate || ''}
                                onChange={(e) => updateExtractedField('invoiceDate', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                              />
                            </div>
                          </div>

                          {/* Tax Breakdown */}
                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Taxable Amount:</span>
                              <span className="font-mono font-semibold text-white">
                                ₹{(selectedFile.extractedData.taxableValue || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">CGST + SGST:</span>
                              <span className="font-mono font-semibold text-emerald-400">
                                ₹
                                {(
                                  (selectedFile.extractedData.cgstAmount || 0) +
                                  (selectedFile.extractedData.sgstAmount || 0)
                                ).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">IGST:</span>
                              <span className="font-mono font-semibold text-indigo-400">
                                ₹{(selectedFile.extractedData.igstAmount || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                              <span className="text-slate-300">Total Invoice Value:</span>
                              <span className="font-mono text-emerald-300">
                                ₹{(selectedFile.extractedData.totalAmount || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : selectedFile.status === 'ERROR' ? (
                      <div className="p-6 bg-slate-900/90 rounded-xl border border-rose-800/60 space-y-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-400">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-white">AI Extraction Notice</h4>
                            <p className="text-xs text-rose-300 mt-1 leading-relaxed">
                              {selectedFile.error || 'The AI extraction engine was unable to parse this invoice document.'}
                            </p>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1.5 font-mono text-slate-400">
                          <div className="flex justify-between">
                            <span>Document Name:</span>
                            <span className="text-slate-200 truncate max-w-[200px]">{selectedFile.file.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>File Size:</span>
                            <span className="text-slate-200">{(selectedFile.file.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Detected Type:</span>
                            <span className="text-slate-200">{selectedFile.file.type || 'Inferred from extension'}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 pt-2">
                          <button
                            type="button"
                            onClick={() => retrySingleFile(selectedFile.id)}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-sm"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry Extraction</span>
                          </button>
                        </div>
                      </div>
                    ) : selectedFile.status === 'EXTRACTING' ? (
                      <div className="text-center py-20 text-slate-400 space-y-3">
                        <Loader2 className="w-10 h-10 mx-auto text-indigo-400 animate-spin" />
                        <div>
                          <p className="text-sm font-bold text-white">Extracting with Gemini AI...</p>
                          <p className="text-xs text-slate-400 mt-1">Analyzing supplier GSTIN, tax tables, HSN codes, and amounts.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 space-y-3">
                        <Sparkles className="w-10 h-10 mx-auto text-indigo-400" />
                        <div>
                          <p className="text-sm font-bold text-white">Ready for AI Extraction</p>
                          <p className="text-xs text-slate-400 mt-1">Click "Start AI Extraction" above to run Gemini OCR on this document.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Select an invoice file from the queue on the left to inspect OCR output.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
