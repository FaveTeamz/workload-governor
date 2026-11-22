export interface Column<T> {
  key:     string
  header:  string
  render?: (row: T) => React.ReactNode
}

export interface TableProps<T extends Record<string, unknown>> {
  columns:  Column<T>[]
  rows:     T[]
  caption?: string
}

export function Table<T extends Record<string, unknown>>({ columns, rows, caption }: TableProps<T>) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="table">
        {caption && <caption className="table__caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} scope="col">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table__empty">No data</td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
