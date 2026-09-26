import React from 'react';
import { AlertTriangle, Loader2, Lock, Trash2, X } from 'lucide-react';

export interface DeleteModalItemDetails {
  id: string;
  label: string;
  subLabel?: string;
  amount?: number;
  date?: string;
  docType?: string;
  gstin?: string;
  notes?: string;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  recordType?: string;
  itemDetails?: DeleteModalItemDetails | null;
  isDeleting: boolean;
  errorMessage?: string | null;
  isPermissionDenied?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title = 'Delete Purchase Invoice',
  recordType = 'purchase invoice',
  itemDetails,
  isDeleting,
  errorMessage,
  isPermissionDenied = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 pr-6">
            <h3 id="delete-modal-title" className="text-base font-bold text-white">
              {title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Are you sure you want to permanently delete this {recordType}?
            </p>
          </div>
        </div>

        {/* Target Details Card */}
        {itemDetails && (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-emerald-400">
                {itemDetails.docType ? `[${itemDetails.docType}] ` : ''}
                {itemDetails.label}
              </span>
              {itemDetails.date && (
                <span className="text-slate-400 text-[11px] font-mono">{itemDetails.date}</span>
              )}
            </div>

            {itemDetails.subLabel && (
              <div className="text-slate-300 font-medium truncate">{itemDetails.subLabel}</div>
            )}

            {itemDetails.gstin && (
              <div className="font-mono text-[11px] text-slate-400">GSTIN: {itemDetails.gstin}</div>
            )}

            {typeof itemDetails.amount === 'number' && (
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Invoice Total:</span>
                <span className="font-mono font-bold text-white">
                  ₹{itemDetails.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Warning Notice */}
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-3 text-[11px] text-rose-300 flex items-start space-x-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            <strong>Warning:</strong> This action cannot be undone. The voucher will be permanently removed
            from your register and reconciliation metrics will be automatically updated.
          </span>
        </div>

        {/* Error Alert Display */}
        {errorMessage && (
          <div className="bg-rose-950/50 border border-rose-600 rounded-xl p-3 text-xs text-rose-200 space-y-1">
            <span className="font-bold flex items-center space-x-1">
              <span>Deletion Failed</span>
            </span>
            <div className="text-[11px] text-rose-300">{errorMessage}</div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting || isPermissionDenied}
            className={`px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition flex items-center space-x-1.5 ${
              isPermissionDenied
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 disabled:opacity-50'
            }`}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : isPermissionDenied ? (
              <>
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Permission Denied (Admin Only)</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete {itemDetails?.docType || 'Invoice'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
