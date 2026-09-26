import * as XLSX from 'xlsx';
import { GSTR2BRecord, PurchaseInvoice } from '../types';
import { normalizeInvoiceNumber } from '../utils/gstValidation';

export function exportInvoicesToExcel(invoices: PurchaseInvoice[], fileName = 'Biznexco_Purchase_Register.xlsx'): void {
  const data = invoices.map((inv) => ({
    'Buyer GSTIN': inv.buyerGstin,
    'Supplier GSTIN': inv.supplierGstin,
    'Supplier Name': inv.supplierName,
    'Invoice Number': inv.invoiceNumber,
    'Invoice Date': inv.invoiceDate,
    'Document Type': inv.documentType,
    'Place of Supply': inv.placeOfSupply,
    'Taxable Value (₹)': inv.taxableValue,
    'CGST Amount (₹)': inv.cgstAmount,
    'SGST Amount (₹)': inv.sgstAmount,
    'IGST Amount (₹)': inv.igstAmount,
    'Cess Amount (₹)': inv.cessAmount,
    'Total Invoice Value (₹)': inv.totalAmount,
    'HSN / SAC': inv.hsnSac || '',
    'ITC Eligibility': inv.itcEligibility,
    Status: inv.status,
    'Validation Errors': inv.validationErrors?.join('; ') || 'None',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Register');
  XLSX.writeFile(workbook, fileName);
}

export function exportInvoicesToCSV(invoices: PurchaseInvoice[], fileName = 'Biznexco_Purchase_Register.csv'): void {
  const data = invoices.map((inv) => ({
    'Buyer GSTIN': inv.buyerGstin,
    'Supplier GSTIN': inv.supplierGstin,
    'Supplier Name': inv.supplierName,
    'Invoice Number': inv.invoiceNumber,
    'Invoice Date': inv.invoiceDate,
    'Document Type': inv.documentType,
    'Place of Supply': inv.placeOfSupply,
    'Taxable Value': inv.taxableValue,
    CGST: inv.cgstAmount,
    SGST: inv.sgstAmount,
    IGST: inv.igstAmount,
    Cess: inv.cessAmount,
    'Total Amount': inv.totalAmount,
    'HSN / SAC': inv.hsnSac || '',
    'ITC Eligibility': inv.itcEligibility,
    Status: inv.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseGSTR2BFile(
  fileData: ArrayBuffer | string,
  fileName: string,
  orgId: string,
  returnPeriod: string
): GSTR2BRecord[] {
  let rows: any[] = [];

  if (fileName.endsWith('.json')) {
    const text = typeof fileData === 'string' ? fileData : new TextDecoder().decode(fileData);
    const json = JSON.parse(text);

    // Support standard GST portal GSTR-2B JSON schemas:
    // json.data.b2b or json.b2b or array
    const b2bList = json.data?.b2b || json.b2b || (Array.isArray(json) ? json : []);
    const cdnrList = json.data?.cdnr || json.cdnr || [];

    const records: GSTR2BRecord[] = [];

    // Process B2B (Invoices)
    b2bList.forEach((supplier: any, sIdx: number) => {
      const ctin = supplier.ctin || supplier.supplierGstin || '';
      const tradeName = supplier.trdNm || supplier.supplierName || 'VENDOR';
      const invList = supplier.inv || [supplier];

      invList.forEach((inv: any, iIdx: number) => {
        const invNo = String(inv.inum || inv.invoiceNumber || `INV-${sIdx}-${iIdx}`);
        const invDate = inv.idt || inv.invoiceDate || '2024-04-01';
        const val = Number(inv.val || inv.invoiceValue || 0);
        const pos = String(inv.pos || '27');
        const rchrg = inv.rchrg === 'Y' || inv.reverseCharge === true;

        let taxable = 0;
        let igst = 0;
        let cgst = 0;
        let sgst = 0;
        let cess = 0;

        if (Array.isArray(inv.items)) {
          inv.items.forEach((item: any) => {
            const itm = item.itm_det || item;
            taxable += Number(itm.txval || 0);
            igst += Number(itm.iamt || 0);
            cgst += Number(itm.camt || 0);
            sgst += Number(itm.samt || 0);
            cess += Number(itm.csamt || 0);
          });
        } else {
          taxable = Number(inv.taxableValue || val * 0.85);
          igst = Number(inv.igstAmount || 0);
          cgst = Number(inv.cgstAmount || 0);
          sgst = Number(inv.sgstAmount || 0);
          cess = Number(inv.cessAmount || 0);
        }

        records.push({
          id: `gstr2b_json_${Date.now()}_${sIdx}_${iIdx}`,
          orgId,
          returnPeriod,
          supplierGstin: ctin,
          supplierName: tradeName,
          invoiceNumber: invNo,
          normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
          invoiceDate: invDate.includes('-') ? invDate : invDate.split('/').reverse().join('-'),
          documentType: 'INV',
          invoiceValue: val || taxable + igst + cgst + sgst + cess,
          placeOfSupply: pos,
          reverseCharge: rchrg,
          taxableValue: taxable,
          igstAmount: igst,
          cgstAmount: cgst,
          sgstAmount: sgst,
          cessAmount: cess,
          itcAvailable: inv.itc_avl !== 'N',
          filingDate: inv.fldt || '2024-05-11',
          gstr1FilingStatus: 'FILED',
        });
      });
    });

    // Process CDNR (Credit/Debit Notes)
    cdnrList.forEach((supplier: any, sIdx: number) => {
      const ctin = supplier.ctin || supplier.supplierGstin || '';
      const tradeName = supplier.trdNm || supplier.supplierName || 'VENDOR';
      const ntList = supplier.nt || [supplier];

      ntList.forEach((nt: any, nIdx: number) => {
        const ntNo = String(nt.nt_num || nt.noteNumber || `CRN-${sIdx}-${nIdx}`);
        const ntDate = nt.nt_dt || nt.noteDate || '2024-04-15';
        const docType = (nt.ntty === 'C' ? 'CRN' : nt.ntty === 'D' ? 'DBN' : 'CRN') as 'CRN' | 'DBN';
        const val = Number(nt.val || 0);

        let taxable = 0;
        let igst = 0;
        let cgst = 0;
        let sgst = 0;

        if (Array.isArray(nt.items)) {
          nt.items.forEach((item: any) => {
            const itm = item.itm_det || item;
            taxable += Number(itm.txval || 0);
            igst += Number(itm.iamt || 0);
            cgst += Number(itm.camt || 0);
            sgst += Number(itm.samt || 0);
          });
        }

        records.push({
          id: `gstr2b_cdnr_${Date.now()}_${sIdx}_${nIdx}`,
          orgId,
          returnPeriod,
          supplierGstin: ctin,
          supplierName: tradeName,
          invoiceNumber: ntNo,
          normalizedInvoiceNumber: normalizeInvoiceNumber(ntNo),
          invoiceDate: ntDate.includes('-') ? ntDate : ntDate.split('/').reverse().join('-'),
          documentType: docType,
          invoiceValue: val || taxable + igst + cgst + sgst,
          placeOfSupply: String(nt.pos || '27'),
          reverseCharge: false,
          taxableValue: taxable,
          igstAmount: igst,
          cgstAmount: cgst,
          sgstAmount: sgst,
          cessAmount: 0,
          itcAvailable: true,
          filingDate: nt.fldt || '2024-05-11',
          gstr1FilingStatus: 'FILED',
        });
      });
    });

    return records;
  }

  // Handle Excel / CSV
  const workbook = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'string' : 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);
  const validRows = rawRows.filter((row) => {
    const hasInv = Boolean(row['Invoice Number'] || row['Invoice number'] || row['inum'] || row['Inv No']);
    const hasGstin = Boolean(row['GSTIN of supplier'] || row['Supplier GSTIN'] || row['ctin'] || row['GSTIN']);
    return hasInv && hasGstin;
  });

  return validRows.map((row, idx) => {
    const invNo = String(row['Invoice Number'] || row['Invoice number'] || row['inum'] || row['Inv No'] || `INV-${idx}`);
    const gstin = String(row['GSTIN of supplier'] || row['Supplier GSTIN'] || row['ctin'] || row['GSTIN'] || '').trim().toUpperCase();
    const tradeName = String(row['Trade/Legal name'] || row['Supplier Name'] || row['trdNm'] || 'VENDOR');
    const invDate = String(row['Invoice Date'] || row['Date'] || row['idt'] || '2024-04-10');
    const docTypeRaw = String(row['Invoice Type'] || row['Doc Type'] || row['documentType'] || 'INV').toUpperCase();
    const docType = docTypeRaw.includes('CREDIT') || docTypeRaw === 'CRN' ? 'CRN' : docTypeRaw.includes('DEBIT') || docTypeRaw === 'DBN' ? 'DBN' : 'INV';

    const taxable = Number(row['Taxable Value (₹)'] || row['Taxable Value'] || row['txval'] || 0);
    const igst = Number(row['Integrated Tax (₹)'] || row['IGST'] || row['iamt'] || 0);
    const cgst = Number(row['Central Tax (₹)'] || row['CGST'] || row['camt'] || 0);
    const sgst = Number(row['State/UT Tax (₹)'] || row['SGST'] || row['samt'] || 0);
    const cess = Number(row['Cess (₹)'] || row['Cess'] || row['csamt'] || 0);
    const totalVal = Number(row['Invoice Value (₹)'] || row['Invoice Value'] || row['val'] || taxable + igst + cgst + sgst + cess);

    return {
      id: `gstr2b_file_${Date.now()}_${idx}`,
      orgId,
      returnPeriod,
      supplierGstin: gstin,
      supplierName: tradeName,
      invoiceNumber: invNo,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invNo),
      invoiceDate: invDate.length === 10 && invDate.includes('/') ? invDate.split('/').reverse().join('-') : invDate,
      documentType: docType,
      invoiceValue: totalVal,
      placeOfSupply: String(row['Place of supply'] || row['pos'] || '27'),
      reverseCharge: String(row['Reverse Charge'] || row['rchrg'] || 'N').toUpperCase().startsWith('Y'),
      taxableValue: taxable,
      igstAmount: igst,
      cgstAmount: cgst,
      sgstAmount: sgst,
      cessAmount: cess,
      itcAvailable: String(row['ITC Availability'] || row['itc_avl'] || 'Y').toUpperCase() !== 'N',
      filingDate: String(row['GSTR-1/IFF Filing Date'] || '2024-05-11'),
      gstr1FilingStatus: 'FILED',
    };
  });
}
