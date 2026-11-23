/**
 * Escapes a CSV field value per RFC 4180.
 *
 * If the value contains a comma, double-quote, or newline (CR or LF),
 * the field is wrapped in double quotes and internal double quotes are doubled.
 *
 * @see https://www.rfc-editor.org/rfc/rfc4180
 */
export function escapeCSVField(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Converts an array of row objects to an RFC 4180-compliant CSV string.
 *
 * - Header and data rows are separated by CRLF (\r\n) per the spec.
 * - All field values are passed through escapeCSVField.
 * - Missing keys in a row produce an empty column.
 *
 * @param headers - Column headers in order
 * @param rows    - Array of records (values indexed by header key)
 */
export function toCSV(
  headers: string[],
  rows: Record<string, string>[],
): string {
  const headerLine = headers.map(escapeCSVField).join(',')
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCSVField(row[h] ?? '')).join(','),
  )
  return [headerLine, ...dataLines].join('\r\n')
}
