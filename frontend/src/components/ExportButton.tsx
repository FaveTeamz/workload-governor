import { toCSV } from '../utils/csvUtils'

export interface ExportRow {
  contributor: string
  orgId: string
  issueId: string
  status: string
}

export interface ExportButtonProps {
  /** Rows to include in the exported CSV. */
  rows: ExportRow[]
  /** File name for the download. Defaults to "export.csv". */
  filename?: string
}

/**
 * Renders a button that, when clicked, downloads the provided rows as an
 * RFC 4180-compliant CSV file.
 *
 * All field values are escaped via escapeCSVField — fields containing commas,
 * double quotes, or newlines are safely quoted so the output opens correctly
 * in Excel and LibreOffice Calc.
 */
export function ExportButton({ rows, filename = 'export.csv' }: ExportButtonProps) {
  function handleExport() {
    const headers: Array<keyof ExportRow> = ['contributor', 'orgId', 'issueId', 'status']
    const csv = toCSV(headers, rows as unknown as Record<string, string>[])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.setAttribute('aria-label', `Download ${filename}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      className="btn btn-ghost"
      onClick={handleExport}
      aria-label="Export as CSV"
      data-testid="export-button"
    >
      Export CSV
    </button>
  )
}
