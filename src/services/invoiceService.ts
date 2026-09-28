import {
  AuditLog,
  DocumentType,
  GSTR2BRecord,
  Organization,
  PurchaseInvoice,
  ReconciliationItem,
  UploadBatch,
  UserRole,
  UserSession,
} from '../types';
import {
  BENCHMARK_BOOKS_INVOICES,
  BENCHMARK_GSTR2B_RECORDS,
  DEFAULT_ORG,
} from '../utils/testDatasets';
import { normalizeInvoiceNumber, validatePurchaseInvoice } from '../utils/gstValidation';
import { runReconciliation } from '../utils/reconciliationEngine';
import { generate100InvoicesDataset } from '../utils/stressTest100';
import { getSupabaseClient } from './supabaseClient';
import { getGstr2bReturnPeriod, getInvoiceReturnPeriod, isInReturnPeriod } from '../utils/returnPeriod';

const STORAGE_KEY_INVOICES = 'biznexco_invoices_v1';
const STORAGE_KEY_GSTR2B = 'biznexco_gstr2b_v1';
const STORAGE_KEY_RECON = 'biznexco_recon_v1';
const STORAGE_KEY_BATCHES = 'biznexco_batches_v1';
const STORAGE_KEY_AUDIT = 'biznexco_audit_v1';
const STORAGE_KEY_ORG = 'biznexco_org_v1';
const STORAGE_KEY_INITIALIZED = 'biznexco_initialized_v1';

// In-memory fallback if localStorage is unavailable (Node.js runtime/SSR/tests)
const invoiceMemoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return invoiceMemoryStore[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {}
  invoiceMemoryStore[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  delete invoiceMemoryStore[key];
}

export class InvoiceService {
  private static currentOrg: Organization = DEFAULT_ORG;

  public static getOrganization(): Organization {
    const saved = safeGetItem(STORAGE_KEY_ORG);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.currentOrg = { ...DEFAULT_ORG, ...parsed, currentReturnPeriod: typeof parsed.currentReturnPeriod === 'string' ? parsed.currentReturnPeriod : DEFAULT_ORG.currentReturnPeriod };
        }
      } catch {}
    }
    return this.currentOrg;
  }

  public static saveOrganization(org: Organization): void {
    this.currentOrg = org;
    safeSetItem(STORAGE_KEY_ORG, JSON.stringify(org));
    this.addAuditLog('ORGANIZATION', org.id, 'UPDATE', `Organization settings updated: ${org.name}`, 'System Admin');
  }

  // INVOICES
  public static getInvoices(): PurchaseInvoice[] {
    const data = safeGetItem(STORAGE_KEY_INVOICES);
    const initialized = safeGetItem(STORAGE_KEY_INITIALIZED);

    if (!data) {
      if (initialized) {
        return [];
      }
      // First time initialization: populate initial setup
      safeSetItem(STORAGE_KEY_INITIALIZED, 'true');
      safeSetItem(STORAGE_KEY_INVOICES, JSON.stringify(BENCHMARK_BOOKS_INVOICES));
      return BENCHMARK_BOOKS_INVOICES;
    }
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }

  public static saveInvoices(invoices: PurchaseInvoice[]): void {
    safeSetItem(STORAGE_KEY_INITIALIZED, 'true');
    safeSetItem(STORAGE_KEY_INVOICES, JSON.stringify(invoices));
  }

  public static addInvoice(invoice: Partial<PurchaseInvoice>): { invoice: PurchaseInvoice; validation: ReturnType<typeof validatePurchaseInvoice> } {
    const invoices = this.getInvoices();
    const org = this.getOrganization();

    const fullInvoice: PurchaseInvoice = {
      id: invoice.id || `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orgId: org.id,
      supplierName: invoice.supplierName || '',
      supplierGstin: invoice.supplierGstin ? invoice.supplierGstin.trim().toUpperCase() : '',
      supplierAddress: invoice.supplierAddress || '',
      buyerGstin: org.gstin,
      invoiceNumber: invoice.invoiceNumber || '',
      normalizedInvoiceNumber: normalizeInvoiceNumber(invoice.invoiceNumber || ''),
      invoiceDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
      returnPeriod: invoice.returnPeriod || org.currentReturnPeriod,
      documentType: invoice.documentType || 'INV',
      placeOfSupply: invoice.placeOfSupply || org.stateCode,
      taxableValue: Number(invoice.taxableValue) || 0,
      cgstAmount: Number(invoice.cgstAmount) || 0,
      sgstAmount: Number(invoice.sgstAmount) || 0,
      igstAmount: Number(invoice.igstAmount) || 0,
      cessAmount: Number(invoice.cessAmount) || 0,
      totalAmount: Number(invoice.totalAmount) || 0,
      hsnSac: invoice.hsnSac || '',
      lineItems: invoice.lineItems || [],
      itcEligibility: invoice.itcEligibility || 'ELIGIBLE',
      status: invoice.status || 'PENDING_REVIEW',
      fileUrl: invoice.fileUrl,
      fileName: invoice.fileName,
      fileType: invoice.fileType,
      batchId: invoice.batchId,
      confidenceScores: invoice.confidenceScores || {},
      extractionWarnings: invoice.extractionWarnings || [],
      validationErrors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: invoice.notes,
    };

    const validation = validatePurchaseInvoice(fullInvoice, org.gstin, invoices);
    fullInvoice.validationErrors = validation.errors;
    if (!validation.isValid) {
      fullInvoice.status = 'FLAGGED';
    }

    invoices.unshift(fullInvoice);
    this.saveInvoices(invoices);

    this.addAuditLog('INVOICE', fullInvoice.id, 'CREATE', `Created invoice ${fullInvoice.invoiceNumber} for ${fullInvoice.supplierName}`, 'Tax Accountant');

    // Sync to Supabase if connected
    this.syncToSupabase('purchase_invoices', fullInvoice).catch(console.error);

    return { invoice: fullInvoice, validation };
  }

  public static updateInvoice(updatedInvoice: PurchaseInvoice): PurchaseInvoice {
    const invoices = this.getInvoices();
    const org = this.getOrganization();

    updatedInvoice.normalizedInvoiceNumber = normalizeInvoiceNumber(updatedInvoice.invoiceNumber);
    updatedInvoice.returnPeriod = updatedInvoice.returnPeriod || getInvoiceReturnPeriod(updatedInvoice) || org.currentReturnPeriod;
    const validation = validatePurchaseInvoice(updatedInvoice, org.gstin, invoices);
    updatedInvoice.validationErrors = validation.errors;
    updatedInvoice.updatedAt = new Date().toISOString();

    const idx = invoices.findIndex((i) => i.id === updatedInvoice.id);
    if (idx !== -1) {
      invoices[idx] = updatedInvoice;
    } else {
      invoices.push(updatedInvoice);
    }

    this.saveInvoices(invoices);
    this.addAuditLog('INVOICE', updatedInvoice.id, 'UPDATE', `Updated invoice ${updatedInvoice.invoiceNumber}`, 'Tax Accountant');
    return updatedInvoice;
  }

  private static simulatedDbFailure: boolean = false;

  public static setSimulatedDbFailure(fail: boolean): void {
    this.simulatedDbFailure = fail;
  }

  public static deleteInvoice(
    invoiceId: string,
    userRole: UserRole = 'ADMIN'
  ): { success: boolean; error?: string } {
    if (userRole !== 'ADMIN') {
      return {
        success: false,
        error: `Permission Denied: User role "${userRole}" cannot delete purchase invoices. Administrator privileges are required.`,
      };
    }

    if (this.simulatedDbFailure) {
      return {
        success: false,
        error: 'Database Error (SIMULATED_RLS_BLOCK): Policy evaluation failed or network connection refused.',
      };
    }

    let invoices = this.getInvoices();
    const target = invoices.find((i) => i.id === invoiceId);
    if (!target) {
      return { success: false, error: `Invoice with ID "${invoiceId}" not found in register.` };
    }
    invoices = invoices.filter((i) => i.id !== invoiceId);
    this.saveInvoices(invoices);

    this.addAuditLog('INVOICE', invoiceId, 'DELETE', `Deleted invoice ${target.invoiceNumber}`, 'Tax Accountant');

    // Cascade to Supabase if connected
    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(client.from('invoice_line_items').delete().eq('invoice_id', invoiceId)).catch(console.error);
      Promise.resolve(client.from('purchase_invoices').delete().eq('id', invoiceId)).catch(console.error);
    }

    return { success: true };
  }

  public static async deleteInvoiceAsync(
    invoiceId: string,
    userRole: UserRole = 'ADMIN'
  ): Promise<{ success: boolean; error?: string }> {
    // 1. RBAC permission validation: only ADMIN can delete
    if (userRole !== 'ADMIN') {
      return {
        success: false,
        error: `Permission Denied: User role "${userRole}" cannot delete purchase invoices. Administrator privileges are required.`,
      };
    }

    // 2. Simulated DB failure mode for test verification
    if (this.simulatedDbFailure) {
      return {
        success: false,
        error: 'Database Error (SIMULATED_RLS_BLOCK): Policy evaluation failed or network connection refused.',
      };
    }

    // 3. Existence check
    let invoices = this.getInvoices();
    const target = invoices.find((i) => i.id === invoiceId);
    if (!target) {
      return {
        success: false,
        error: `Invoice with ID "${invoiceId}" does not exist in the Purchase Register.`,
      };
    }

    // 4. Remote Supabase deletion if configured
    const client = getSupabaseClient();
    if (client) {
      try {
        // Cascade delete dependent line items first
        const { error: lineItemsErr } = await client
          .from('invoice_line_items')
          .delete()
          .eq('invoice_id', invoiceId);

        if (lineItemsErr) {
          console.error('Supabase line items deletion failed:', lineItemsErr);
          return {
            success: false,
            error: `Failed to remove line items from Supabase (${lineItemsErr.code || 'DB_ERROR'}): ${lineItemsErr.message}`,
          };
        }

        // Delete purchase invoice record
        const { error: invoiceErr } = await client
          .from('purchase_invoices')
          .delete()
          .eq('id', invoiceId);

        if (invoiceErr) {
          console.error('Supabase invoice deletion failed:', invoiceErr);
          return {
            success: false,
            error: `Remote database rejection (${invoiceErr.code || 'RLS_BLOCK'}): ${invoiceErr.message}`,
          };
        }
      } catch (err: any) {
        console.error('Network/Database error during deletion:', err);
        return {
          success: false,
          error: `Network error connecting to Supabase: ${err.message || 'Unknown database error'}`,
        };
      }
    }

    // 5. Update local storage state
    const remaining = invoices.filter((i) => i.id !== invoiceId);
    this.saveInvoices(remaining);

    // 6. Append immutable audit log
    this.addAuditLog(
      'INVOICE',
      invoiceId,
      'DELETE',
      `Permanently deleted invoice ${target.invoiceNumber} (${target.supplierName})`,
      'System Administrator'
    );

    return { success: true };
  }

  // GSTR-2B RECORDS
  public static deleteGSTR2BRecord(recordId: string): { success: boolean; error?: string } {
    let records = this.getGSTR2BRecords();
    const target = records.find((r) => r.id === recordId);
    if (!target) {
      return { success: false, error: `GSTR-2B record with ID "${recordId}" was not found.` };
    }
    records = records.filter((r) => r.id !== recordId);
    this.saveGSTR2BRecords(records);
    this.addAuditLog('GSTR2B', recordId, 'DELETE', `Deleted GSTR-2B record ${target.invoiceNumber}`, 'System Administrator');
    return { success: true };
  }
  public static getGSTR2BRecords(): GSTR2BRecord[] {
    const data = safeGetItem(STORAGE_KEY_GSTR2B);
    const initialized = safeGetItem(STORAGE_KEY_INITIALIZED);

    if (!data) {
      if (initialized) {
        return [];
      }
      safeSetItem(STORAGE_KEY_INITIALIZED, 'true');
      safeSetItem(STORAGE_KEY_GSTR2B, JSON.stringify(BENCHMARK_GSTR2B_RECORDS));
      return BENCHMARK_GSTR2B_RECORDS;
    }
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }

  public static saveGSTR2BRecords(records: GSTR2BRecord[]): void {
    safeSetItem(STORAGE_KEY_INITIALIZED, 'true');
    safeSetItem(STORAGE_KEY_GSTR2B, JSON.stringify(records));
  }

  public static addGSTR2BRecords(newRecords: GSTR2BRecord[]): void {
    const existing = this.getGSTR2BRecords();
    const existingIds = new Set(existing.map((r) => r.id));
    const uniqueNew = newRecords.filter((r) => !existingIds.has(r.id));
    const combined = [...uniqueNew, ...existing];

    this.saveGSTR2BRecords(combined);
    this.addAuditLog('GSTR2B', 'batch_import', 'IMPORT', `Imported ${uniqueNew.length} GSTR-2B records.`, 'Tax Auditor');
  }

  // RECONCILIATION
  public static getReconciliationResults(): ReconciliationItem[] {
    const org = this.getOrganization();
    const data = safeGetItem(STORAGE_KEY_RECON);
    if (data) {
      try {
        const current = JSON.parse(data).filter((item: ReconciliationItem) =>
          isInReturnPeriod(item.returnPeriod, org.currentReturnPeriod)
        );
        if (current.length > 0) return current;
      } catch {}
    }
    // Compute fresh reconciliation from existing data.
    // Never let a malformed legacy/local record prevent the entire application from rendering.
    try {
      const allBooks = this.getInvoices();
      const allGstr2b = this.getGSTR2BRecords();
      const books = allBooks.filter((invoice) => isInReturnPeriod(getInvoiceReturnPeriod(invoice), org.currentReturnPeriod));
      const gstr2b = allGstr2b.filter((record) => isInReturnPeriod(getGstr2bReturnPeriod(record), org.currentReturnPeriod));
      const stored = safeGetItem(STORAGE_KEY_RECON);
      const existing = stored
        ? (() => {
            try {
              const parsed = JSON.parse(stored);
              return Array.isArray(parsed)
                ? parsed.filter((r: ReconciliationItem) => isInReturnPeriod(r.returnPeriod, org.currentReturnPeriod))
                : [];
            } catch {
              return [];
            }
          })()
        : [];
      const results = runReconciliation(books, gstr2b, org.currentReturnPeriod, existing);
      this.saveReconciliationResults(results);
      return results;
    } catch (error) {
      console.error('[InvoiceService] Failed to initialize reconciliation data:', error);
      return [];
    }
  }

  public static saveReconciliationResults(results: ReconciliationItem[]): void {
    const org = this.getOrganization();
    const existingRaw = safeGetItem(STORAGE_KEY_RECON);
    let existing: ReconciliationItem[] = [];
    if (existingRaw) {
      try { existing = JSON.parse(existingRaw); } catch {}
    }
    const preserved = existing.filter((item) => !isInReturnPeriod(item.returnPeriod, org.currentReturnPeriod));
    safeSetItem(STORAGE_KEY_RECON, JSON.stringify([...preserved, ...results]));
  }

  public static executeReconciliation(): ReconciliationItem[] {
    const org = this.getOrganization();
    const books = this.getInvoices().filter((invoice) => isInReturnPeriod(getInvoiceReturnPeriod(invoice), org.currentReturnPeriod));
    const gstr2b = this.getGSTR2BRecords().filter((record) => isInReturnPeriod(getGstr2bReturnPeriod(record), org.currentReturnPeriod));
    const existing = this.getReconciliationResults();

    const results = runReconciliation(books, gstr2b, org.currentReturnPeriod, existing);
    this.saveReconciliationResults(results);
    this.addAuditLog('RECONCILIATION', org.currentReturnPeriod, 'EXECUTE', `Executed intelligent GST reconciliation engine (${results.length} results).`, 'Automated Engine');
    return results;
  }

  public static updateReconciliationStatus(
    id: string,
    status: ReconciliationItem['status'],
    comments?: string,
    user = 'Tax Auditor'
  ): ReconciliationItem | null {
    const results = this.getReconciliationResults();
    const item = results.find((r) => r.id === id);
    if (!item) return null;

    const oldStatus = item.status;
    item.status = status;
    if (comments) item.userComments = comments;
    item.reviewedBy = user;
    item.reviewedAt = new Date().toISOString();

    this.saveReconciliationResults(results);
    this.addAuditLog(
      'RECONCILIATION',
      id,
      'STATUS_CHANGE',
      `Changed review status from ${oldStatus} to ${status}. Note: ${comments || 'None'}`,
      user
    );
    return item;
  }

  public static manuallyLinkMatch(
    bookInvoiceId: string,
    gstr2bRecordId: string,
    comments: string,
    user = 'Tax Auditor'
  ): ReconciliationItem {
    const books = this.getInvoices();
    const gstr2b = this.getGSTR2BRecords();
    const org = this.getOrganization();

    const book = books.find((b) => b.id === bookInvoiceId);
    const g2b = gstr2b.find((g) => g.id === gstr2bRecordId);

    if (!book || !g2b) {
      throw new Error('Invoice or GSTR-2B record not found');
    }

    const taxableDiff = g2b.taxableValue - book.taxableValue;
    const cgstDiff = g2b.cgstAmount - book.cgstAmount;
    const sgstDiff = g2b.sgstAmount - book.sgstAmount;
    const igstDiff = g2b.igstAmount - book.igstAmount;
    const totalDiff = g2b.invoiceValue - book.totalAmount;

    const newItem: ReconciliationItem = {
      id: `recon_manual_${book.id}_${g2b.id}`,
      orgId: org.id,
      returnPeriod: org.currentReturnPeriod,
      invoiceId: book.id,
      gstr2bId: g2b.id,
      bookInvoice: book,
      gstr2bRecord: g2b,
      matchType: 'MANUAL_MATCH',
      matchScore: 90,
      matchReason: `Manually linked by ${user}.`,
      confidenceLevel: 'HIGH',
      taxableDiff,
      cgstDiff,
      sgstDiff,
      igstDiff,
      cessDiff: 0,
      totalDiff,
      status: 'ACCEPTED',
      userComments: comments,
      reviewedBy: user,
      reviewedAt: new Date().toISOString(),
      suggestedAction: 'Manual linkage confirmed by auditor.',
    };

    let results = this.getReconciliationResults();
    // Remove previous standalone missing items
    results = results.filter(
      (r) =>
        !(r.invoiceId === book.id && r.matchType === 'MISSING_IN_2B') &&
        !(r.gstr2bId === g2b.id && r.matchType === 'MISSING_IN_BOOKS')
    );
    results.unshift(newItem);

    this.saveReconciliationResults(results);
    this.addAuditLog('RECONCILIATION', newItem.id, 'MANUAL_LINK', `Linked Book Inv ${book.invoiceNumber} with 2B ${g2b.invoiceNumber}`, user);
    return newItem;
  }

  // UPLOAD BATCHES
  public static getBatches(): UploadBatch[] {
    const data = safeGetItem(STORAGE_KEY_BATCHES);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  public static saveBatches(batches: UploadBatch[]): void {
    safeSetItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
  }

  public static createBatch(name: string, totalFiles: number): UploadBatch {
    const org = this.getOrganization();
    const batch: UploadBatch = {
      id: `batch_${Date.now()}`,
      orgId: org.id,
      name,
      totalFiles,
      processedFiles: 0,
      failedFiles: 0,
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      invoices: [],
    };

    const batches = this.getBatches();
    batches.unshift(batch);
    this.saveBatches(batches);
    return batch;
  }

  public static updateBatch(batch: UploadBatch): void {
    const batches = this.getBatches();
    const idx = batches.findIndex((b) => b.id === batch.id);
    if (idx !== -1) {
      batches[idx] = batch;
      this.saveBatches(batches);
    }
  }

  // AUDIT LOGS
  public static getAuditLogs(): AuditLog[] {
    const data = safeGetItem(STORAGE_KEY_AUDIT);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  public static addAuditLog(
    recordType: AuditLog['recordType'],
    recordId: string,
    action: string,
    details: string,
    user: string
  ): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: this.getOrganization().id,
      recordType,
      recordId,
      action,
      details,
      user,
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newLog);
    if (logs.length > 500) logs.pop(); // keep last 500
    safeSetItem(STORAGE_KEY_AUDIT, JSON.stringify(logs));
  }

  // RESET TO BENCHMARK SUITE
  public static resetToBenchmarkData(): void {
    safeRemoveItem(STORAGE_KEY_INVOICES);
    safeRemoveItem(STORAGE_KEY_GSTR2B);
    safeRemoveItem(STORAGE_KEY_RECON);
    safeRemoveItem(STORAGE_KEY_BATCHES);

    safeSetItem(STORAGE_KEY_INVOICES, JSON.stringify(BENCHMARK_BOOKS_INVOICES));
    safeSetItem(STORAGE_KEY_GSTR2B, JSON.stringify(BENCHMARK_GSTR2B_RECORDS));

    const recon = runReconciliation(BENCHMARK_BOOKS_INVOICES, BENCHMARK_GSTR2B_RECORDS, DEFAULT_ORG.currentReturnPeriod);
    safeSetItem(STORAGE_KEY_RECON, JSON.stringify(recon));

    this.addAuditLog(
      'BATCH',
      'reset_benchmarks',
      'SYSTEM_RESET',
      'Loaded complete 9-scenario GST benchmark test suite.',
      'System Admin'
    );
  }

  // LOAD 100-INVOICE STRESS TEST DATASET
  public static load100InvoiceStressDataset(): void {
    const { books, gstr2b } = generate100InvoicesDataset();
    // Benchmark datasets intentionally span multiple invoice dates (including >30-day
    // date-variance cases). Keep them in the active benchmark return-period scope so
    // the period-aware production reconciliation filters do not hide the very records
    // the benchmark is designed to validate.
    const benchmarkPeriod = this.getOrganization().currentReturnPeriod;
    const scopedBooks = books.map((invoice) => ({ ...invoice, returnPeriod: benchmarkPeriod }));
    const scopedGstr2b = gstr2b.map((record) => ({ ...record, returnPeriod: benchmarkPeriod }));

    safeRemoveItem(STORAGE_KEY_INVOICES);
    safeRemoveItem(STORAGE_KEY_GSTR2B);
    safeRemoveItem(STORAGE_KEY_RECON);
    safeRemoveItem(STORAGE_KEY_BATCHES);

    safeSetItem(STORAGE_KEY_INVOICES, JSON.stringify(scopedBooks));
    safeSetItem(STORAGE_KEY_GSTR2B, JSON.stringify(scopedGstr2b));

    const recon = runReconciliation(scopedBooks, scopedGstr2b, benchmarkPeriod);
    safeSetItem(STORAGE_KEY_RECON, JSON.stringify(recon));

    this.addAuditLog(
      'BATCH',
      'stress_test_100',
      'STRESS_LOAD',
      `Loaded 100-invoice stress test dataset (${scopedBooks.length} purchase vouchers, ${scopedGstr2b.length} GSTR-2B records) for return period ${benchmarkPeriod}.`,
      'System Auditor'
    );
  }

  // Optional Supabase Background Sync
  private static async syncToSupabase(table: string, payload: any): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await client.from(table).upsert(payload);
    } catch (err) {
      console.warn(`Supabase sync warning for ${table}:`, err);
    }
  }
}
