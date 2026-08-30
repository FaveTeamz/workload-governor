import type { ReactNode } from "react";

export interface ColumnDef<T> {
  /** Unique column key */
  key: string;
  /** Column header label */
  header: ReactNode;
  /** Render function for a cell */
  render: (row: T) => ReactNode;
  /** Optional alignment */
  align?: "left" | "center" | "right";
}

export interface TableProps<T> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Row data */
  data: T[];
  /** Function to derive a stable row key */
  rowKey: (row: T) => string;
  /** Message shown when data is empty */
  emptyMessage?: string;
  /** Accessible caption for the table */
  caption?: string;
  /** Whether the table is in a loading state */
  loading?: boolean;
}

/**
 * Design-system Table.
 * Generic, accessible data table with configurable columns and empty state.
 */
export function Table<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data available.",
  caption,
  loading = false,
}: TableProps<T>) {
  return (
    <div className="table-wrapper" role="region" aria-busy={loading}>
      <table className="table">
        {caption && <caption className="table-caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ textAlign: col.align ?? "left" }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="table-loading">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? "left" }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
