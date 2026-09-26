import { DocumentType, PurchaseInvoice } from '../types';

export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

// Official GSTIN Regex: 2 digits state code + 5 chars PAN alphabets + 4 chars PAN digits + 1 char PAN alphabet + 1 char entity code + 'Z' + 1 char checksum
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// GST invoice number regex: alphanumeric and / or - only, max 16 chars
export const INVOICE_NO_REGEX = /^[A-Za-z0-9/-]{1,16}$/;

export function validateGSTIN(gstin: string): { isValid: boolean; error?: string; stateName?: string } {
  if (!gstin) {
    return { isValid: false, error: 'GSTIN is required' };
  }

  const clean = gstin.trim().toUpperCase();

  if (clean.length !== 15) {
    return { isValid: false, error: `GSTIN must be exactly 15 characters (currently ${clean.length})` };
  }

  if (!GSTIN_REGEX.test(clean)) {
    return { isValid: false, error: 'Invalid GSTIN structure (Expected format: 22AAAAA0000A1Z5)' };
  }

  const stateCode = clean.substring(0, 2);
  const stateName = INDIAN_STATES[stateCode];

  if (!stateName) {
    return { isValid: false, error: `Invalid GST state code prefix "${stateCode}"` };
  }

  return { isValid: true, stateName };
}

export function validateInvoiceNumber(invoiceNo: string): { isValid: boolean; error?: string } {
  if (!invoiceNo) {
    return { isValid: false, error: 'Invoice number is required' };
  }

  const trimmed = invoiceNo.trim();

  if (trimmed.length > 16) {
    return { isValid: false, error: `Invoice number exceeds GST limit of 16 characters (${trimmed.length} chars)` };
  }

  if (!INVOICE_NO_REGEX.test(trimmed)) {
    return { isValid: false, error: 'Invoice number can only contain alphanumeric characters, "/" and "-"' };
  }

  return { isValid: true };
}

/**
 * Normalizes an invoice number for fuzzy/reconciliation matching:
 * - strips prefixes like INV, BILL, NO, FY etc.
 * - removes leading zeros (e.g. "0045" -> "45")
 * - removes slashes, hyphens, spaces
 * - uppercase
 */
export function normalizeInvoiceNumber(invoiceNo: string): string {
  if (!invoiceNo) return '';
  let clean = invoiceNo.trim().toUpperCase();

  // Strip leading prefixes like "INV-", "INV/", "TI-", "BILL/", "TAX-INV-", "FY24/", "2024-25/", "CRN-", "DBN-"
  clean = clean.replace(/^(INV|BILL|TAX|TI|NO|REF|DOC|CRN|DBN|CN|DN)[/-]/i, '');
  clean = clean.replace(/^(FY[0-9]{2,4}|\b20[0-9]{2}[/-][0-9]{2,4}|\b20[0-9]{2})[/-]/i, '');

  // Strip punctuation / separators
  clean = clean.replace(/[/\\_\-\s]/g, '');

  // Strip leading zeros if remaining is alphanumeric with numbers
  clean = clean.replace(/^0+/, '');

  return clean || invoiceNo.trim().toUpperCase();
}

export function validateInvoiceDate(dateStr: string): { isValid: boolean; error?: string; warning?: string } {
  if (!dateStr) {
    return { isValid: false, error: 'Invoice date is required' };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { isValid: false, error: 'Invalid date format (Use YYYY-MM-DD)' };
  }

  const now = new Date();
  // Allow today + 1 day for timezone differences
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date > tomorrow) {
    return { isValid: false, error: 'Invoice date cannot be in the future' };
  }

  // Warning if invoice is older than 18 months (ITC claim limitation)
  const eighteenMonthsAgo = new Date();
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

  if (date < eighteenMonthsAgo) {
    return {
      isValid: true,
      warning: 'Invoice is older than 18 months. Verification required under Section 16(4) of CGST Act.',
    };
  }

  return { isValid: true };
}

export function isInterStateSupply(buyerGstin: string, supplierGstin: string, placeOfSupply?: string): boolean {
  if (!buyerGstin || !supplierGstin) return false;
  const buyerState = buyerGstin.trim().substring(0, 2);
  const supplierState = supplierGstin.trim().substring(0, 2);
  
  if (placeOfSupply && placeOfSupply.trim()) {
    return placeOfSupply.trim() !== supplierState;
  }
  
  return buyerState !== supplierState;
}

export interface InvoiceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePurchaseInvoice(
  invoice: Partial<PurchaseInvoice>,
  buyerGstin: string,
  existingInvoices: PurchaseInvoice[] = []
): InvoiceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Supplier GSTIN
  if (!invoice.supplierGstin) {
    errors.push('Supplier GSTIN is required.');
  } else {
    const gstinCheck = validateGSTIN(invoice.supplierGstin);
    if (!gstinCheck.isValid && gstinCheck.error) {
      errors.push(`Supplier GSTIN: ${gstinCheck.error}`);
    }
  }

  // 2. Supplier Name
  if (!invoice.supplierName || invoice.supplierName.trim().length === 0) {
    errors.push('Supplier Name is required.');
  }

  // 3. Invoice Number
  if (!invoice.invoiceNumber) {
    errors.push('Invoice Number is required.');
  } else {
    const invCheck = validateInvoiceNumber(invoice.invoiceNumber);
    if (!invCheck.isValid && invCheck.error) {
      errors.push(`Invoice Number: ${invCheck.error}`);
    }
  }

  // 4. Invoice Date
  if (!invoice.invoiceDate) {
    errors.push('Invoice Date is required.');
  } else {
    const dateCheck = validateInvoiceDate(invoice.invoiceDate);
    if (!dateCheck.isValid && dateCheck.error) {
      errors.push(`Invoice Date: ${dateCheck.error}`);
    }
    if (dateCheck.warning) {
      warnings.push(dateCheck.warning);
    }
  }

  // 5. Document Type
  if (!invoice.documentType || !['INV', 'CRN', 'DBN'].includes(invoice.documentType)) {
    errors.push('Valid Document Type is required (INV, CRN, DBN).');
  }

  // 6. Taxable Value
  const taxable = Number(invoice.taxableValue) || 0;
  if (taxable <= 0 && invoice.documentType !== 'CRN') {
    errors.push('Taxable Value must be greater than 0.');
  }

  // 7. Inter-state vs Intra-state tax rules
  const cgst = Number(invoice.cgstAmount) || 0;
  const sgst = Number(invoice.sgstAmount) || 0;
  const igst = Number(invoice.igstAmount) || 0;
  const cess = Number(invoice.cessAmount) || 0;
  const total = Number(invoice.totalAmount) || 0;

  if (invoice.supplierGstin && buyerGstin) {
    const interState = isInterStateSupply(buyerGstin, invoice.supplierGstin, invoice.placeOfSupply);
    if (interState) {
      if (cgst > 0 || sgst > 0) {
        errors.push(
          `Inter-state supply detected (Buyer: ${buyerGstin.substring(0, 2)}, Supplier: ${invoice.supplierGstin.substring(0, 2)}). Only IGST should be charged, not CGST/SGST.`
        );
      }
      if (igst === 0 && taxable > 0) {
        warnings.push('Inter-state supply has 0 IGST. Please verify if exempt or zero-rated.');
      }
    } else {
      if (igst > 0) {
        errors.push(
          `Intra-state supply detected (Both within state ${buyerGstin.substring(0, 2)}). CGST and SGST should be charged, not IGST.`
        );
      }
      if (Math.abs(cgst - sgst) > 0.5) {
        errors.push(`CGST (₹${cgst.toFixed(2)}) and SGST (₹${sgst.toFixed(2)}) must be equal in intra-state transactions.`);
      }
    }
  }

  // 8. Mathematical Total check
  const calculatedTotal = taxable + cgst + sgst + igst + cess;
  const diff = Math.abs(calculatedTotal - total);
  if (diff > 1.0) {
    errors.push(
      `Tax calculation mismatch: Taxable (₹${taxable.toFixed(2)}) + Taxes (₹${(cgst + sgst + igst + cess).toFixed(2)}) = ₹${calculatedTotal.toFixed(2)}, but Total Amount is ₹${total.toFixed(2)} (Variance: ₹${diff.toFixed(2)}).`
    );
  }

  // 9. Duplicate Invoice check
  if (invoice.supplierGstin && invoice.invoiceNumber) {
    const norm = normalizeInvoiceNumber(invoice.invoiceNumber);
    const duplicate = existingInvoices.find(
      (existing) =>
        existing.id !== invoice.id &&
        existing.supplierGstin.trim().toUpperCase() === invoice.supplierGstin?.trim().toUpperCase() &&
        (normalizeInvoiceNumber(existing.invoiceNumber) === norm || existing.invoiceNumber.trim().toUpperCase() === invoice.invoiceNumber?.trim().toUpperCase())
    );

    if (duplicate) {
      errors.push(
        `Duplicate invoice: Invoice ${duplicate.invoiceNumber} from this supplier already exists in records (ID: ${duplicate.id.substring(0, 8)}).`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
