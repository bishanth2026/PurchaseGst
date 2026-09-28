export type DocumentType = 'INV' | 'CRN' | 'DBN';

export type InvoiceStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'FLAGGED';

export type ITCEligibility = 'ELIGIBLE' | 'INELIGIBLE_17_5' | 'PENDING';

export type MatchType =
  | 'EXACT'
  | 'PROBABLE'
  | 'MISMATCH_VALUE'
  | 'MISMATCH_TAX'
  | 'MISSING_IN_2B'
  | 'MISSING_IN_BOOKS'
  | 'DUPLICATE'
  | 'CRN_DBN_DIFF'
  | 'MANUAL_MATCH';

export type ReviewStatus = 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'RESOLVED';

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'AUDITOR' | 'VIEWER';

export interface LineItem {
  id: string;
  description: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  unitRate: number;
  taxableValue: number;
  gstRate: number; // 0, 5, 12, 18, 28
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  confidence?: number;
  itcEligibility?: ITCEligibility;
  blockedReason?: string;
}

export interface FieldConfidences {
  supplierGSTIN?: number;
  supplierName?: number;
  invoiceNumber?: number;
  invoiceDate?: number;
  documentType?: number;
  taxableValue?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cessAmount?: number;
  totalAmount?: number;
  hsnSac?: number;
  lineItems?: number;
  [key: string]: number | undefined;
}

export interface PurchaseInvoice {
  id: string;
  orgId: string;
  supplierName: string;
  supplierGstin: string;
  supplierAddress?: string;
  buyerGstin: string;
  invoiceNumber: string;
  normalizedInvoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  returnPeriod?: string; // normalized MM-YYYY; legacy records derive this from invoiceDate
  documentType: DocumentType;
  placeOfSupply: string; // 2-digit state code, e.g. "27"
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  hsnSac: string;
  lineItems: LineItem[];
  itcEligibility: ITCEligibility;
  status: InvoiceStatus;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  batchId?: string;
  confidenceScores: FieldConfidences;
  extractionWarnings: string[];
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface GSTR2BRecord {
  id: string;
  orgId: string;
  returnPeriod: string; // e.g. "042024" or "Apr 2024"
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  normalizedInvoiceNumber: string;
  invoiceDate: string;
  documentType: DocumentType;
  invoiceValue: number;
  placeOfSupply: string;
  reverseCharge: boolean;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  itcAvailable: boolean;
  filingDate?: string;
  gstr1FilingStatus?: 'FILED' | 'NOT_FILED';
}

export interface ReconciliationItem {
  id: string;
  orgId: string;
  returnPeriod: string;
  invoiceId?: string;
  gstr2bId?: string;
  bookInvoice?: PurchaseInvoice;
  gstr2bRecord?: GSTR2BRecord;
  matchType: MatchType;
  matchScore: number; // 0 - 100
  matchReason: string;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  taxableDiff: number;
  cgstDiff: number;
  sgstDiff: number;
  igstDiff: number;
  cessDiff: number;
  totalDiff: number;
  status: ReviewStatus;
  userComments?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  suggestedAction?: string;
  matchingMethod?: string;
  dateDifferenceDays?: number;
  manualReviewWarning?: string;
  supportingEvidence?: string[];
  itcEligibilityCategory?: 'PROVISIONALLY_MATCHED_SUBJECT_TO_17_5' | 'BLOCKED_SECTION_17_5' | 'PENDING_AUDITOR_REVIEW' | 'INELIGIBLE_MISMATCH';
}

export interface UploadBatch {
  id: string;
  orgId: string;
  name: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  invoices: PurchaseInvoice[];
}

export interface AuditLog {
  id: string;
  orgId: string;
  recordType: 'INVOICE' | 'RECONCILIATION' | 'BATCH' | 'GSTR2B' | 'ORGANIZATION';
  recordId: string;
  action: string;
  details: string;
  user: string;
  timestamp: string;
}

export interface DashboardMetrics {
  totalBooksInvoices: number;
  totalBooksTaxable: number;
  totalBooksCGST: number;
  totalBooksSGST: number;
  totalBooksIGST: number;
  totalBooksITC: number; // CGST + SGST + IGST
  totalBooksCess: number;
  
  total2BRecords: number;
  total2BTaxable: number;
  total2BCGST: number;
  total2BSGST: number;
  total2BIGST: number;
  total2BITC: number;
  
  matchedTaxable: number;
  matchedCGST: number;
  matchedSGST: number;
  matchedIGST: number;
  matchedITC: number;
  matchedCount: number;
  
  probableTaxable: number;
  probableCGST: number;
  probableSGST: number;
  probableIGST: number;
  probableITC: number;
  probableCount: number;
  
  mismatchTaxable: number;
  mismatchCGST: number;
  mismatchSGST: number;
  mismatchIGST: number;
  mismatchITC: number;
  mismatchCount: number;
  
  missingIn2BTaxable: number;
  missingIn2BCGST: number;
  missingIn2BSGST: number;
  missingIn2BIGST: number;
  missingIn2BITC: number;
  missingIn2BCount: number;
  
  missingInBooksTaxable: number;
  missingInBooksCGST: number;
  missingInBooksSGST: number;
  missingInBooksIGST: number;
  missingInBooksITC: number;
  missingInBooksCount: number;
  
  duplicateTaxable: number;
  duplicateCGST: number;
  duplicateSGST: number;
  duplicateIGST: number;
  duplicateITC: number;
  duplicateCount: number;
  
  unresolvedCount: number;
  
  eligibleITC: number;
  ineligibleITC: number; // Blocked under Sec 17(5)
  netClaimableITC: number;
}

export interface Organization {
  id: string;
  name: string;
  tradeName: string;
  gstin: string;
  stateCode: string;
  address: string;
  currentReturnPeriod: string;
}

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  currentOrg: Organization;
}
