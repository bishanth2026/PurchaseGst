export function normalizeReturnPeriod(period?: string | null): string {
  if (!period) return '';

  const value = period.trim();
  if (!value) return '';

  // MM-YYYY / MM/YYYY / MMYYYY / YYYY-MM
  let match = value.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) return `${match[1].padStart(2, '0')}-${match[2]}`;

  match = value.match(/^(\d{2})(\d{4})$/);
  if (match) return `${match[1]}-${match[2]}`;

  match = value.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return `${match[2].padStart(2, '0')}-${match[1]}`;

  // Month name formats such as "Apr 2024" / "April 2024"
  const monthMatch = value.match(/^([A-Za-z]+)[\s-]+(\d{4})$/);
  if (monthMatch) {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const monthIndex = months.findIndex((m) => m.startsWith(monthMatch[1].toLowerCase()));
    if (monthIndex >= 0) return `${String(monthIndex + 1).padStart(2, '0')}-${monthMatch[2]}`;
  }

  return value;
}

export function returnPeriodFromDate(date?: string | null): string {
  if (!date) return '';
  const match = date.match(/^(\d{4})-(\d{2})-/);
  return match ? `${match[2]}-${match[1]}` : '';
}

export function getInvoiceReturnPeriod(invoice: { returnPeriod?: string; invoiceDate?: string }): string {
  return normalizeReturnPeriod(invoice.returnPeriod) || returnPeriodFromDate(invoice.invoiceDate);
}

export function getGstr2bReturnPeriod(record: { returnPeriod?: string; invoiceDate?: string }): string {
  return normalizeReturnPeriod(record.returnPeriod) || returnPeriodFromDate(record.invoiceDate);
}

export function isInReturnPeriod(period: string | undefined | null, selectedPeriod: string): boolean {
  return normalizeReturnPeriod(period) === normalizeReturnPeriod(selectedPeriod);
}
