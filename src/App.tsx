import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { PurchaseRegisterView } from './components/PurchaseRegisterView';
import { BatchUploadView } from './components/BatchUploadView';
import { Gstr2bView } from './components/Gstr2bView';
import { ReconciliationView } from './components/ReconciliationView';
import { BenchmarkTestView } from './components/BenchmarkTestView';
import { ManualInvoiceModal } from './components/ManualInvoiceModal';
import { SupabaseSettingsModal } from './components/SupabaseSettingsModal';
import { DeleteConfirmationModal } from './components/DeleteConfirmationModal';

import { Organization, PurchaseInvoice, UserRole } from './types';
import { InvoiceService } from './services/invoiceService';
import { computeDashboardMetrics } from './utils/reconciliationEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [organization, setOrganization] = useState<Organization>(() => InvoiceService.getOrganization());
  const [userRole, setUserRole] = useState<UserRole>('ADMIN');

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>(() => InvoiceService.getInvoices());
  const [gstr2bRecords, setGstr2bRecords] = useState(() => InvoiceService.getGSTR2BRecords());
  const [reconciliations, setReconciliations] = useState(() => InvoiceService.getReconciliationResults());

  // Modal states
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated Delete Confirmation State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    invoice: PurchaseInvoice | null;
    isDeleting: boolean;
    errorMessage: string | null;
  }>({
    isOpen: false,
    invoice: null,
    isDeleting: false,
    errorMessage: null,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Synchronize state when organization changes
  const handleUpdateOrganization = (newOrg: Organization) => {
    setOrganization(newOrg);
    InvoiceService.saveOrganization(newOrg);
    showToast(`Return Period updated to ${newOrg.currentReturnPeriod}`);
  };

  // Re-fetch all data from service
  const refreshAllData = () => {
    const updatedInvoices = InvoiceService.getInvoices();
    const updated2B = InvoiceService.getGSTR2BRecords();
    const updatedRecon = InvoiceService.getReconciliationResults();

    setInvoices([...updatedInvoices]);
    setGstr2bRecords([...updated2B]);
    setReconciliations([...updatedRecon]);
  };

  // Re-run the reconciliation engine
  const handleRunReconciliation = () => {
    const results = InvoiceService.executeReconciliation();
    setReconciliations([...results]);
    showToast(`Reconciliation executed: ${results.length} total matches evaluated.`);
  };

  // Reset to the official 9-scenario GST benchmark
  const handleResetBenchmark = () => {
    InvoiceService.resetToBenchmarkData();
    refreshAllData();
    showToast('Loaded standard 9-scenario GST benchmark test suite.');
  };

  // Load the 100-invoice enterprise stress dataset
  const handleLoad100Invoices = () => {
    InvoiceService.load100InvoiceStressDataset();
    refreshAllData();
    showToast('Loaded 100-invoice stress test dataset (100 Book vouchers, 97 GSTR-2B records).');
  };

  // Invoice Actions
  const handleOpenAddInvoice = () => {
    setEditingInvoice(null);
    setIsInvoiceModalOpen(true);
  };

  const handleOpenEditInvoice = (invoice: PurchaseInvoice) => {
    setEditingInvoice(invoice);
    setIsInvoiceModalOpen(true);
  };

  const handleSaveInvoice = (invoicePayload: Partial<PurchaseInvoice>) => {
    if (editingInvoice) {
      const updated = InvoiceService.updateInvoice({
        ...editingInvoice,
        ...invoicePayload,
      } as PurchaseInvoice);
      showToast(`Updated invoice ${updated.invoiceNumber}`);
    } else {
      const { invoice, validation } = InvoiceService.addInvoice(invoicePayload);
      if (validation.isValid) {
        showToast(`Saved invoice ${invoice.invoiceNumber} to Purchase Register`);
      } else {
        showToast(`Saved invoice ${invoice.invoiceNumber} (Flagged with warnings)`);
      }
    }
    refreshAllData();
    handleRunReconciliation();
  };

  const handleDeleteInvoice = (id: string) => {
    const target = invoices.find((inv) => inv.id === id);
    if (!target) {
      showToast('Error: Invoice not found in register.');
      return;
    }

    if (userRole !== 'ADMIN') {
      setDeleteModalState({
        isOpen: true,
        invoice: target,
        isDeleting: false,
        errorMessage: `Permission Denied: User role "${userRole}" cannot delete records. Switch your role to "Admin" in the top navigation bar to perform deletions.`,
      });
      return;
    }

    setDeleteModalState({
      isOpen: true,
      invoice: target,
      isDeleting: false,
      errorMessage: null,
    });
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deleteModalState.invoice) return;
    const invId = deleteModalState.invoice.id;
    const invNo = deleteModalState.invoice.invoiceNumber;

    if (userRole !== 'ADMIN') {
      setDeleteModalState((prev) => ({
        ...prev,
        errorMessage: `Permission Denied: User role "${userRole}" cannot delete records. Administrator role is required.`,
      }));
      return;
    }

    setDeleteModalState((prev) => ({ ...prev, isDeleting: true, errorMessage: null }));

    try {
      const result = await InvoiceService.deleteInvoiceAsync(invId, userRole);
      if (!result.success) {
        setDeleteModalState((prev) => ({
          ...prev,
          isDeleting: false,
          errorMessage: result.error || 'Failed to delete invoice from database.',
        }));
        return;
      }

      setDeleteModalState({
        isOpen: false,
        invoice: null,
        isDeleting: false,
        errorMessage: null,
      });

      refreshAllData();
      handleRunReconciliation();
      showToast(`Invoice ${invNo} successfully deleted from register.`);
    } catch (err: any) {
      console.error('Error during invoice deletion:', err);
      setDeleteModalState((prev) => ({
        ...prev,
        isDeleting: false,
        errorMessage: err.message || 'An unexpected error occurred while deleting invoice.',
      }));
    }
  };

  const handleCloseDeleteModal = () => {
    if (deleteModalState.isDeleting) return;
    setDeleteModalState({
      isOpen: false,
      invoice: null,
      isDeleting: false,
      errorMessage: null,
    });
  };

  // Derived Dashboard Metrics
  const metrics = useMemo(() => {
    return computeDashboardMetrics(invoices, gstr2bRecords, reconciliations);
  }, [invoices, gstr2bRecords, reconciliations]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        organization={organization}
        setOrganization={handleUpdateOrganization}
        userRole={userRole}
        setUserRole={setUserRole}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
        onResetBenchmark={handleResetBenchmark}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            metrics={metrics}
            organization={organization}
            onNavigateTab={setActiveTab}
            onRunReconciliation={handleRunReconciliation}
          />
        )}

        {activeTab === 'register' && (
          <PurchaseRegisterView
            invoices={invoices}
            organization={organization}
            userRole={userRole}
            onAddInvoice={handleOpenAddInvoice}
            onEditInvoice={handleOpenEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {activeTab === 'upload' && (
          <BatchUploadView
            organization={organization}
            onInvoicesCommitted={() => {
              refreshAllData();
              handleRunReconciliation();
              setActiveTab('register');
              showToast('Invoices committed to Purchase Register');
            }}
          />
        )}

        {activeTab === 'gstr2b' && (
          <Gstr2bView
            records={gstr2bRecords}
            organization={organization}
            onImportComplete={() => {
              refreshAllData();
              handleRunReconciliation();
              showToast('GSTR-2B records updated and reconciled.');
            }}
          />
        )}

        {activeTab === 'reconciliation' && (
          <ReconciliationView
            reconciliations={reconciliations}
            booksInvoices={invoices}
            gstr2bRecords={gstr2bRecords}
            organization={organization}
            onRefreshReconciliation={handleRunReconciliation}
          />
        )}

        {activeTab === 'tests' && (
          <BenchmarkTestView
            reconciliations={reconciliations}
            metrics={metrics}
            onResetBenchmark={handleResetBenchmark}
            onLoad100Invoices={handleLoad100Invoices}
          />
        )}
      </main>

      {/* Manual Invoice Creation / Edit Modal */}
      <ManualInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onSave={handleSaveInvoice}
        organization={organization}
        initialInvoice={editingInvoice}
      />

      {/* Supabase & Security Architecture Modal */}
      <SupabaseSettingsModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConfigChanged={() => {
          showToast('Supabase configuration updated.');
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalState.isOpen}
        title="Delete Purchase Invoice"
        recordType="purchase invoice"
        itemDetails={
          deleteModalState.invoice
            ? {
                id: deleteModalState.invoice.id,
                label: deleteModalState.invoice.invoiceNumber,
                subLabel: deleteModalState.invoice.supplierName,
                amount: deleteModalState.invoice.totalAmount,
                date: deleteModalState.invoice.invoiceDate,
                docType: deleteModalState.invoice.documentType,
                gstin: deleteModalState.invoice.supplierGstin,
              }
            : null
        }
        isDeleting={deleteModalState.isDeleting}
        errorMessage={deleteModalState.errorMessage}
        isPermissionDenied={userRole !== 'ADMIN'}
        onConfirm={handleConfirmDeleteInvoice}
        onClose={handleCloseDeleteModal}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 border border-emerald-400/40 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
