import { FieldConfidences, LineItem, PurchaseInvoice } from '../types';
import { normalizeInvoiceNumber } from '../utils/gstValidation';

export interface OCRExtractionResult {
  invoice: Partial<PurchaseInvoice>;
  rawOutput: any;
  confidenceScores: FieldConfidences;
  warnings: string[];
  uncertainFields: string[];
}

// Infer MIME type accurately from extension if missing or generic
export function inferMimeType(fileName: string, providedMime?: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';

  if (providedMime && providedMime !== 'application/octet-stream' && providedMime.includes('/')) {
    return providedMime;
  }
  return 'image/jpeg';
}

// Safely parse numeric amounts from AI output (handles currency symbols, commas, and scientific notation)
function parseCurrencyNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function extractInvoiceDataFromFile(
  file: File,
  buyerGstin: string,
  orgId: string
): Promise<OCRExtractionResult> {
  // Pre-flight file validations
  if (!file) {
    throw new Error('No invoice document selected.');
  }

  if (file.size === 0) {
    throw new Error(`The file "${file.name}" is empty (0 bytes). Please upload a valid purchase invoice document.`);
  }

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`The file "${file.name}" (${sizeMb} MB) exceeds the maximum upload limit of 20 MB. Please compress or resize the document.`);
  }

  const actualMimeType = inferMimeType(file.name, file.type);
  const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!supportedTypes.includes(actualMimeType)) {
    throw new Error(`Unsupported file type (${file.type || 'unknown'}). Supported formats are PDF, PNG, JPG, and WEBP.`);
  }

  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}". The file may be locked or corrupted.`));
    reader.readAsDataURL(file);
  });

  if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
    console.log(`[OCR Client] Requesting /api/ocr-extract for "${file.name}" (${file.size} bytes, MIME: ${actualMimeType})`);
  }

  let response: Response;
  const configuredBackend =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OCR_BACKEND_URL) ||
    'https://obdkzsxdbaoudzudzazi.supabase.co/functions/v1/biznexco-ocr';

  try {
    response = await fetch(configuredBackend, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: base64Data,
        mimeType: actualMimeType,
        fileName: file.name,
      }),
    });
  } catch (netErr: any) {
    console.error('[OCR Client] Network connection failure to /api/ocr-extract:', netErr);
    throw new Error('Unable to connect to the OCR backend server. Please verify your network connection.');
  }

  let result: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    result = await response.json();
  } else {
    const rawText = await response.text();
    console.error('[OCR Client] Server returned non-JSON response:', rawText);
    throw new Error(`Server returned unexpected HTTP ${response.status} response.`);
  }

  if (!response.ok || !result || result.success === false) {
    const errMsg = result?.error || `OCR extraction failed with HTTP status ${response.status}`;
    console.error('[OCR Client] OCR extraction returned failure:', result);
    throw new Error(errMsg);
  }

  const raw = result.data || {};

  const confidenceScores: FieldConfidences = raw.confidenceScores || {
    supplierGSTIN: 0.9,
    supplierName: 0.9,
    invoiceNumber: 0.9,
    invoiceDate: 0.9,
    taxableValue: 0.9,
    totalAmount: 0.9,
  };

  const uncertainFields: string[] = [];
  Object.entries(confidenceScores).forEach(([key, val]) => {
    if (typeof val === 'number' && val < 0.85) {
      uncertainFields.push(key);
    }
  });

  const warnings: string[] = [...(raw.warnings || [])];
  if (uncertainFields.length > 0) {
    warnings.push(
      `Attention: Low confidence detected in fields (${uncertainFields.join(', ')}). Manual review required.`
    );
  }

  const lineItems: LineItem[] = Array.isArray(raw.lineItems)
    ? raw.lineItems.map((li: any, idx: number) => ({
        id: `li_${Date.now()}_${idx}`,
        description: li.description || `Item ${idx + 1}`,
        hsnSac: li.hsnSac || raw.hsnSac || '',
        quantity: parseCurrencyNumber(li.quantity) || 1,
        unit: li.unit || 'NOS',
        unitRate: parseCurrencyNumber(li.unitRate) || parseCurrencyNumber(li.taxableValue) || 0,
        taxableValue: parseCurrencyNumber(li.taxableValue) || 0,
        gstRate: parseCurrencyNumber(li.gstRate) || 18,
        cgstAmount: parseCurrencyNumber(li.cgstAmount) || 0,
        sgstAmount: parseCurrencyNumber(li.sgstAmount) || 0,
        igstAmount: parseCurrencyNumber(li.igstAmount) || 0,
        cessAmount: parseCurrencyNumber(li.cessAmount) || 0,
        totalAmount: parseCurrencyNumber(li.totalAmount) || parseCurrencyNumber(li.taxableValue) || 0,
        confidence: Number(li.confidence) || 0.9,
      }))
    : [];

  const invoiceNumber = raw.invoiceNumber || '';
  const taxableValue = parseCurrencyNumber(raw.taxableValue);
  const cgstAmount = parseCurrencyNumber(raw.cgstAmount);
  const sgstAmount = parseCurrencyNumber(raw.sgstAmount);
  const igstAmount = parseCurrencyNumber(raw.igstAmount);
  const cessAmount = parseCurrencyNumber(raw.cessAmount);
  const totalAmount = parseCurrencyNumber(raw.totalAmount) || (taxableValue + cgstAmount + sgstAmount + igstAmount + cessAmount);

  const invoice: Partial<PurchaseInvoice> = {
    orgId,
    supplierName: raw.supplierName || '',
    supplierGstin: (raw.supplierGstin || '').toUpperCase().trim(),
    supplierAddress: raw.supplierAddress || '',
    buyerGstin,
    invoiceNumber,
    normalizedInvoiceNumber: normalizeInvoiceNumber(invoiceNumber),
    invoiceDate: raw.invoiceDate || new Date().toISOString().split('T')[0],
    documentType: raw.documentType === 'CRN' ? 'CRN' : raw.documentType === 'DBN' ? 'DBN' : 'INV',
    placeOfSupply: raw.placeOfSupply || '27',
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount,
    totalAmount,
    hsnSac: raw.hsnSac || (lineItems[0]?.hsnSac || ''),
    lineItems,
    itcEligibility: 'ELIGIBLE',
    status: uncertainFields.length > 0 ? 'PENDING_REVIEW' : 'APPROVED',
    fileUrl: base64Data, // Store base64 preview
    fileName: file.name,
    fileType: actualMimeType,
    confidenceScores,
    extractionWarnings: warnings,
    validationErrors: [],
  };

  return {
    invoice,
    rawOutput: raw,
    confidenceScores,
    warnings,
    uncertainFields,
  };
}
