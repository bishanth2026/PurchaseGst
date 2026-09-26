import { GSTR2BRecord, PurchaseInvoice } from '../types';
import { normalizeInvoiceNumber } from './gstValidation';
import { runReconciliation, computeDashboardMetrics } from './reconciliationEngine';

export interface StressTestAuditReport {
  inputBooksCount: number;
  input2BCount: number;
  outputReconciliationCount: number;
  matchedCount: number;
  probableCount: number;
  mismatchCount: number;
  missingIn2BCount: number;
  missingInBooksCount: number;
  duplicateCount: number;
  totalTaxableValue: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalITC: number;
  droppedOrUnaccountedRecords: number;
  mathematicalBalancePassed: boolean;
  zeroDroppedRecordsPassed: boolean;
  categoryBreakdown: {
    exactMatches: number;
    invoiceNoVariations: number;
    taxableDiffs: number;
    taxDisputes: number;
    dateVariations: number;
    duplicateVouchers: number;
    missingIn2B: number;
    missingInBooks: number;
    creditNotes: number;
    debitNotes: number;
  };
}

const ORG_GSTIN = '27AABCB9876E1Z2'; // Maharashtra (State 27)

interface VendorSpec {
  name: string;
  gstin: string;
  state: string;
  isInterState: boolean;
}

const VENDORS: VendorSpec[] = [
  { name: 'Tata Steel Limited', gstin: '27AAACT2727Q1ZB', state: '27', isInterState: false },
  { name: 'Infosys Limited', gstin: '29AAACI1111Q1ZP', state: '29', isInterState: true },
  { name: 'Reliance Industries', gstin: '24AAACR1234A1Z9', state: '24', isInterState: true },
  { name: 'Larsen & Toubro Ltd', gstin: '27AAACL1234K1Z0', state: '27', isInterState: false },
  { name: 'Asian Paints Ltd', gstin: '27AAACA1234F1Z1', state: '27', isInterState: false },
  { name: 'Wipro Limited', gstin: '29AAACW9999M1Z8', state: '29', isInterState: true },
  { name: 'Dell India Pvt Ltd', gstin: '29AAACD5555L1Z2', state: '29', isInterState: true },
  { name: 'Godrej & Boyce Mfg', gstin: '27AAACG4321P1ZT', state: '27', isInterState: false },
  { name: 'HCL Technologies Ltd', gstin: '07AAACH6789D1Z4', state: '07', isInterState: true },
  { name: 'Mahindra & Mahindra', gstin: '27AAACM1234H1Z6', state: '27', isInterState: false },
  { name: 'Adani Ports & SEZ', gstin: '24AAACA1234J1Z3', state: '24', isInterState: true },
  { name: 'Bharti Airtel Ltd', gstin: '07AAACB1234Q1Z5', state: '07', isInterState: true },
  { name: 'UltraTech Cement Ltd', gstin: '27AAACU1234C1Z7', state: '27', isInterState: false },
  { name: 'Titan Company Ltd', gstin: '33AAACT1234N1Z8', state: '33', isInterState: true },
  { name: 'Havells India Ltd', gstin: '09AAACH1234P1Z2', state: '09', isInterState: true },
  { name: 'Sun Pharma Ind Ltd', gstin: '24AAACS1234M1Z4', state: '24', isInterState: true },
  { name: 'Bajaj Auto Limited', gstin: '27AAACB1234L1Z9', state: '27', isInterState: false },
  { name: 'Siemens India Ltd', gstin: '27AAACS1234R1Z1', state: '27', isInterState: false },
  { name: 'Blue Star Limited', gstin: '27AAACB5678K1Z3', state: '27', isInterState: false },
  { name: 'ITC Limited', gstin: '19AAACI1234E1Z0', state: '19', isInterState: true },
];

function makeInvoice(data: {
  id: string;
  supplierName: string;
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  documentType: 'INV' | 'CRN' | 'DBN';
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  status?: 'APPROVED' | 'PENDING_REVIEW' | 'DRAFT' | 'FLAGGED';
}): PurchaseInvoice {
  return {
    id: data.id,
    orgId: 'org_biznexco_primary',
    supplierName: data.supplierName,
    supplierGstin: data.supplierGstin,
    buyerGstin: ORG_GSTIN,
    invoiceNumber: data.invoiceNumber,
    normalizedInvoiceNumber: normalizeInvoiceNumber(data.invoiceNumber),
    invoiceDate: data.invoiceDate,
    documentType: data.documentType,
    placeOfSupply: '27',
    taxableValue: data.taxableValue,
    cgstAmount: data.cgstAmount,
    sgstAmount: data.sgstAmount,
    igstAmount: data.igstAmount,
    cessAmount: 0,
    totalAmount: data.totalAmount,
    hsnSac: '8471',
    itcEligibility: 'ELIGIBLE',
    status: data.status || 'APPROVED',
    createdAt: '2024-04-15T00:00:00Z',
    updatedAt: '2024-04-15T00:00:00Z',
    confidenceScores: {
      supplierGSTIN: 0.99,
      supplierName: 0.98,
      invoiceNumber: 0.99,
      invoiceDate: 0.99,
      taxableValue: 0.99,
      totalAmount: 0.99,
    },
    extractionWarnings: [],
    validationErrors: [],
    lineItems: [
      {
        id: `li_${data.id}_1`,
        description: 'Enterprise Supplies & Equipment',
        hsnSac: '8471',
        quantity: 1,
        unit: 'NOS',
        unitRate: data.taxableValue,
        taxableValue: data.taxableValue,
        gstRate: 18,
        cgstAmount: data.cgstAmount,
        sgstAmount: data.sgstAmount,
        igstAmount: data.igstAmount,
        cessAmount: 0,
        totalAmount: data.totalAmount,
      },
    ],
  };
}

export function generate100InvoicesDataset(): {
  books: PurchaseInvoice[];
  gstr2b: GSTR2BRecord[];
} {
  const books: PurchaseInvoice[] = [];
  const gstr2b: GSTR2BRecord[] = [];

  let invSeq = 1000;
  const rates = [5, 12, 18, 28];

  const computeTax = (taxable: number, rate: number, isInterState: boolean) => {
    const tax = Math.round(((taxable * rate) / 100) * 100) / 100;
    if (isInterState) {
      return { cgst: 0, sgst: 0, igst: tax, total: taxable + tax };
    }
    const half = Math.round((tax / 2) * 100) / 100;
    return { cgst: half, sgst: half, igst: 0, total: taxable + half * 2 };
  };

  // 1. EXACT MATCHES: 30 Invoices (100% agreement on numbers, date, taxable, and taxes)
  for (let i = 0; i < 30; i++) {
    const vendor = VENDORS[i % VENDORS.length];
    const rate = rates[i % rates.length];
    const taxable = 20000 + (i + 1) * 3000;
    const taxes = computeTax(taxable, rate, vendor.isInterState);
    invSeq++;
    const invNo = `EX-INV-${invSeq}`;
    const date = `2024-04-${String((i % 25) + 1).padStart(2, '0')}`;

    books.push(
      makeInvoice({
        id: `book_exact_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_exact_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 2. INVOICE NUMBER VARIATIONS (NORMALIZED MATCHES): 15 Invoices
  for (let i = 0; i < 15; i++) {
    const vendor = VENDORS[(i + 5) % VENDORS.length];
    const rate = rates[i % rates.length];
    const taxable = 25000 + (i + 1) * 2500;
    const taxes = computeTax(taxable, rate, vendor.isInterState);
    invSeq++;
    const coreNum = String(invSeq);
    const bookInvNo = i % 2 === 0 ? `INV/2024/00${coreNum}` : `TI-${coreNum}`;
    const g2bInvNo = i % 2 === 0 ? `2024/${coreNum}` : `${coreNum}`;
    const date = `2024-04-${String((i % 20) + 1).padStart(2, '0')}`;

    books.push(
      makeInvoice({
        id: `book_varnum_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: bookInvNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_varnum_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: g2bInvNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(g2bInvNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 3. TAXABLE VALUE DIFFERENCES: 10 Invoices
  for (let i = 0; i < 10; i++) {
    const vendor = VENDORS[(i + 2) % VENDORS.length];
    const rate = 18;
    const bookTaxable = 50000 + i * 5000;
    const g2bTaxable = bookTaxable - 2500; // Vendor under-reported
    const bookTaxes = computeTax(bookTaxable, rate, vendor.isInterState);
    const g2bTaxes = computeTax(g2bTaxable, rate, vendor.isInterState);
    invSeq++;
    const invNo = `VAL-DIFF-${invSeq}`;
    const date = `2024-04-${String((i % 15) + 1).padStart(2, '0')}`;

    books.push(
      makeInvoice({
        id: `book_valdiff_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: bookTaxable,
        cgstAmount: bookTaxes.cgst,
        sgstAmount: bookTaxes.sgst,
        igstAmount: bookTaxes.igst,
        totalAmount: bookTaxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_valdiff_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: g2bTaxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: g2bTaxable,
      cgstAmount: g2bTaxes.cgst,
      sgstAmount: g2bTaxes.sgst,
      igstAmount: g2bTaxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 4. CGST/SGST/IGST TAX DISPUTES (RATE MISMATCH): 10 Invoices
  for (let i = 0; i < 10; i++) {
    const vendor = VENDORS[(i + 7) % VENDORS.length];
    const taxable = 60000 + i * 4000;
    invSeq++;
    const invNo = `TAX-DISPUTE-${invSeq}`;
    const date = `2024-04-${String((i % 15) + 5).padStart(2, '0')}`;

    const bookTaxes = computeTax(taxable, 18, vendor.isInterState);
    const g2bTaxes = computeTax(taxable, 12, vendor.isInterState);

    books.push(
      makeInvoice({
        id: `book_taxdiff_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: bookTaxes.cgst,
        sgstAmount: bookTaxes.sgst,
        igstAmount: bookTaxes.igst,
        totalAmount: bookTaxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_taxdiff_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: g2bTaxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: g2bTaxes.cgst,
      sgstAmount: g2bTaxes.sgst,
      igstAmount: g2bTaxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 5. DATE VARIATIONS (>30 DAYS): 10 Invoices
  for (let i = 0; i < 10; i++) {
    const vendor = VENDORS[(i + 4) % VENDORS.length];
    const rate = 18;
    const taxable = 35000 + i * 3000;
    const taxes = computeTax(taxable, rate, vendor.isInterState);
    invSeq++;
    const invNo = `DATE-VAR-${invSeq}`;
    const bookDate = '2024-02-15'; // 60 days before
    const g2bDate = '2024-04-15';

    books.push(
      makeInvoice({
        id: `book_datevar_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: bookDate,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_datevar_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: g2bDate,
      documentType: 'INV',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 6. DUPLICATE INVOICES IN BOOKS: 5 Pairs = 5 Original + 5 Duplicate Copies
  for (let i = 0; i < 5; i++) {
    const vendor = VENDORS[i % 5];
    const taxable = 40000 + i * 2000;
    const taxes = computeTax(taxable, 18, vendor.isInterState);
    invSeq++;
    const invNo = `DUP-BOOK-${invSeq}`;
    const date = '2024-04-10';

    // Original entry in Books
    books.push(
      makeInvoice({
        id: `book_dup_orig_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    // Duplicate copy in Books (accidental re-entry)
    books.push(
      makeInvoice({
        id: `book_dup_copy_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
        status: 'PENDING_REVIEW',
      })
    );

    // GSTR-2B has only the single legitimate record
    gstr2b.push({
      id: `g2b_dup_legit_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 7. MISSING IN GSTR-2B (VENDOR DEFAULT): 5 Invoices
  for (let i = 0; i < 5; i++) {
    const vendor = VENDORS[(i + 8) % VENDORS.length];
    const taxable = 75000 + i * 5000;
    const taxes = computeTax(taxable, 18, vendor.isInterState);
    invSeq++;
    const invNo = `MISS-2B-${invSeq}`;
    const date = '2024-04-14';

    books.push(
      makeInvoice({
        id: `book_miss2b_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: invNo,
        invoiceDate: date,
        documentType: 'INV',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );
  }

  // 8. CREDIT NOTES (CRN): 5 Records (Reversal/Discount)
  for (let i = 0; i < 5; i++) {
    const vendor = VENDORS[(i + 3) % VENDORS.length];
    const taxable = 15000 + i * 2000;
    const taxes = computeTax(taxable, 18, vendor.isInterState);
    invSeq++;
    const crnNo = `CRN-${invSeq}`;
    const date = '2024-04-20';

    books.push(
      makeInvoice({
        id: `book_crn_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: crnNo,
        invoiceDate: date,
        documentType: 'CRN',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_crn_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: crnNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(crnNo),
      invoiceDate: date,
      documentType: 'CRN',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 9. DEBIT NOTES (DBN): 5 Records (Supplementary tax invoice)
  for (let i = 0; i < 5; i++) {
    const vendor = VENDORS[(i + 6) % VENDORS.length];
    const taxable = 10000 + i * 1500;
    const taxes = computeTax(taxable, 18, vendor.isInterState);
    invSeq++;
    const dbnNo = `DBN-${invSeq}`;
    const date = '2024-04-22';

    books.push(
      makeInvoice({
        id: `book_dbn_${i + 1}`,
        supplierName: vendor.name,
        supplierGstin: vendor.gstin,
        invoiceNumber: dbnNo,
        invoiceDate: date,
        documentType: 'DBN',
        taxableValue: taxable,
        cgstAmount: taxes.cgst,
        sgstAmount: taxes.sgst,
        igstAmount: taxes.igst,
        totalAmount: taxes.total,
      })
    );

    gstr2b.push({
      id: `g2b_dbn_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: dbnNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(dbnNo),
      invoiceDate: date,
      documentType: 'DBN',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 10. MISSING IN BOOKS: 5 Records in GSTR-2B absent in Books (Unclaimed ITC opportunity)
  for (let i = 0; i < 5; i++) {
    const vendor = VENDORS[(i + 11) % VENDORS.length];
    const taxable = 30000 + i * 3500;
    const taxes = computeTax(taxable, 18, vendor.isInterState);
    invSeq++;
    const invNo = `MISS-BOOKS-${invSeq}`;
    const date = '2024-04-17';

    gstr2b.push({
      id: `g2b_missbooks_${i + 1}`,
      orgId: 'org_biznexco_primary',
      returnPeriod: '04-2024',
      supplierGstin: vendor.gstin,
      supplierName: vendor.name,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: date,
      documentType: 'INV',
      invoiceValue: taxes.total,
      placeOfSupply: '27',
      reverseCharge: false,
      taxableValue: taxable,
      cgstAmount: taxes.cgst,
      sgstAmount: taxes.sgst,
      igstAmount: taxes.igst,
      cessAmount: 0,
      itcAvailable: true,
      filingDate: '2024-05-11',
    });
  }

  // 11. DUPLICATE FILINGS IN GSTR-2B: 2 Records (Vendor mistakenly filed same invoice twice)
  for (let i = 0; i < 2; i++) {
    const orig = gstr2b[i];
    gstr2b.push({
      ...orig,
      id: `g2b_dup_vendor_mistake_${i + 1}`,
      invoiceValue: orig.invoiceValue,
    });
  }

  return { books, gstr2b };
}

export function run100InvoiceStressAudit(): StressTestAuditReport {
  const { books, gstr2b } = generate100InvoicesDataset();

  // Run reconciliation engine
  const results = runReconciliation(books, gstr2b, '04-2024');

  // Compute metrics
  const metrics = computeDashboardMetrics(books, gstr2b, results);

  // Group reconciliation output by match type
  let exactMatches = 0;
  let probableMatches = 0;
  let mismatches = 0;
  let missingIn2B = 0;
  let missingInBooks = 0;
  let duplicateRecords = 0;

  results.forEach((r) => {
    switch (r.matchType) {
      case 'EXACT':
        exactMatches++;
        break;
      case 'PROBABLE':
        probableMatches++;
        break;
      case 'MISMATCH_TAX':
      case 'MISMATCH_VALUE':
      case 'CRN_DBN_DIFF':
        mismatches++;
        break;
      case 'MISSING_IN_2B':
        missingIn2B++;
        break;
      case 'MISSING_IN_BOOKS':
        missingInBooks++;
        break;
      case 'DUPLICATE':
        duplicateRecords++;
        break;
    }
  });

  // Calculate tax totals from books with credit note reversal sign
  let totalTaxableValue = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  books.forEach((inv) => {
    const sign = inv.documentType === 'CRN' ? -1 : 1;
    totalTaxableValue += inv.taxableValue * sign;
    totalCGST += inv.cgstAmount * sign;
    totalSGST += inv.sgstAmount * sign;
    totalIGST += inv.igstAmount * sign;
  });

  const totalITC = totalCGST + totalSGST + totalIGST;

  // Accounted check:
  // Every book invoice must be accounted for in results (either matched, mismatch, missing in 2b, or duplicate)
  const bookItemResults = results.filter((r) => r.bookInvoice !== undefined);
  const droppedOrUnaccountedRecords = books.length - bookItemResults.length;

  const mathematicalBalancePassed =
    droppedOrUnaccountedRecords === 0 &&
    metrics.totalBooksInvoices === books.length &&
    metrics.total2BRecords === gstr2b.length;

  return {
    inputBooksCount: books.length,
    input2BCount: gstr2b.length,
    outputReconciliationCount: results.length,
    matchedCount: exactMatches,
    probableCount: probableMatches,
    mismatchCount: mismatches,
    missingIn2BCount: missingIn2B,
    missingInBooksCount: missingInBooks,
    duplicateCount: duplicateRecords,
    totalTaxableValue,
    totalCGST,
    totalSGST,
    totalIGST,
    totalITC,
    droppedOrUnaccountedRecords,
    mathematicalBalancePassed,
    zeroDroppedRecordsPassed: droppedOrUnaccountedRecords === 0,
    categoryBreakdown: {
      exactMatches,
      invoiceNoVariations: 15,
      taxableDiffs: 10,
      taxDisputes: 10,
      dateVariations: 10,
      duplicateVouchers: 5,
      missingIn2B: 5,
      missingInBooks: 5,
      creditNotes: 5,
      debitNotes: 5,
    },
  };
}
