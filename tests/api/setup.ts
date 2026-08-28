/** In-memory SQL mock — no real PostgreSQL needed */

export interface Row { [key: string]: unknown }

const tables = new Map<string, Row[]>();
const sequences = new Map<string, number>();

/** Expose table contents for direct DB-state assertions in tests */
export function tbl(name: string): Row[] {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name)!;
}

function nextId(name: string): number {
  const n = (sequences.get(name) ?? 0) + 1;
  sequences.set(name, n);
  return n;
}

export function resetDb(): void {
  tables.clear();
  sequences.clear();
}

export function getTable(name: string): Row[] {
  return tbl(name).slice();
}

// ---------- condition evaluator -----------------------------------------

function evalCond(row: Row, cond: string, params: unknown[]): boolean {
  // col = $n
  let m = cond.match(/^(\w+)\s*=\s*\$(\d+)$/i);
  if (m) return String(row[m[1]]) === String(params[+m[2] - 1]);
  // col ILIKE $n
  m = cond.match(/^(\w+)\s+ILIKE\s+\$(\d+)$/i);
  if (m) {
    const pattern = String(params[+m[2] - 1]).replace(/%/g, '');
    return String(row[m[1]] ?? '').toLowerCase().includes(pattern.toLowerCase());
  }
  // timestamp >= $n
  m = cond.match(/^(\w+)\s*>=\s*\$(\d+)$/i);
  if (m) return new Date(row[m[1]] as string) >= (params[+m[2] - 1] as Date);
  // timestamp <= $n
  m = cond.match(/^(\w+)\s*<=\s*\$(\d+)$/i);
  if (m) return new Date(row[m[1]] as string) <= (params[+m[2] - 1] as Date);
  return true;
}

function filterRows(rows: Row[], where: string | undefined, params: unknown[]): Row[] {
  if (!where) return rows.slice();
  return rows.filter((row) =>
    where.split(/ AND /i).every((c) => evalCond(row, c.trim(), params)),
  );
}

// ---------- query engine ------------------------------------------------

export function runQuery(sql: string, params: unknown[] = []): { rows: Row[] } {
  const s = sql.trim().replace(/\s+/g, ' ');

  // ---- INSERT ----
  // INSERT INTO table (cols) VALUES ($1, $2, ...) [ON CONFLICT ...] [RETURNING ...]
  let m = s.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON CONFLICT\b.*?)?(?: RETURNING (.+))?$/i);
  if (m) {
    const [, tableName, colsStr, valsStr, retStr] = m;
    const cols = colsStr.split(',').map((c) => c.trim());
    const row: Row = { id: nextId(tableName), created_at: new Date().toISOString() };
    const vals = valsStr.split(',').map((v) => v.trim());
    cols.forEach((col, i) => {
      const ph = vals[i];
      const pi = ph.match(/^\$(\d+)$/);
      if (pi) row[col] = params[+pi[1] - 1];
      else row[col] = ph.replace(/^'|'$/g, '');
    });
    tbl(tableName).push(row);
    if (retStr) {
      const retCols = retStr.trim().split(',').map((c) => c.trim());
      return { rows: [Object.fromEntries(retCols.map((c) => [c, row[c]]))] };
    }
    return { rows: [row] };
  }

  // Multi-row INSERT INTO table (cols) VALUES ('a','b'),('c','d')
  m = s.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s+((?:\([^)]+\)\s*,?\s*)+)$/i);
  if (m) {
    const [, tableName, colsStr, allVals] = m;
    const cols = colsStr.split(',').map((c) => c.trim());
    const rowMatches = [...allVals.matchAll(/\(([^)]+)\)/g)];
    for (const rm of rowMatches) {
      const row: Row = { id: nextId(tableName), created_at: new Date().toISOString() };
      const vals = rm[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
      cols.forEach((col, i) => { if (vals[i] !== undefined) row[col] = vals[i]; });
      tbl(tableName).push(row);
    }
    return { rows: [] };
  }

  // ---- UPDATE ----
  // UPDATE table SET col1 = $1, col2 = $2 [WHERE cond]
  m = s.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
  if (m) {
    const [, tableName, setStr, whereStr] = m;

    // Parse SET assignments: "col = $n" pairs
    const assignments: Array<{ col: string; paramIdx: number }> = [];
    for (const part of setStr.split(',')) {
      const am = part.trim().match(/^(\w+)\s*=\s*\$(\d+)$/);
      if (am) assignments.push({ col: am[1], paramIdx: +am[2] });
    }

    const rows = tbl(tableName);
    const matched = filterRows(rows, whereStr, params);
    for (const row of matched) {
      for (const { col, paramIdx } of assignments) {
        row[col] = params[paramIdx - 1];
      }
    }
    return { rows: matched };
  }

  // ---- DELETE ----
  // DELETE FROM table WHERE cond
  m = s.match(/^DELETE FROM (\w+)(?: WHERE (.+))?$/i);
  if (m) {
    const [, tableName, whereStr] = m;
    const rows = tbl(tableName);
    const kept: Row[] = [];
    const deleted: Row[] = [];
    for (const row of rows) {
      if (whereStr) {
        const matches = filterRows([row], whereStr, params);
        if (matches.length > 0) deleted.push(row);
        else kept.push(row);
      } else {
        deleted.push(row);
      }
    }
    tables.set(tableName, kept);
    return { rows: deleted };
  }

  // ---- SELECT COUNT(*) ----
  m = s.match(/^SELECT COUNT\(\*\) as (\w+) FROM (\w+)(?: WHERE (.+?))?$/i);
  if (m) {
    const [, alias, tableName, where] = m;
    const rows = filterRows(tbl(tableName), where, params);
    return { rows: [{ [alias]: String(rows.length) }] };
  }

  // ---- SELECT * / SELECT col,... ----
  // Capture: SELECT <cols> FROM <table> [WHERE <cond>] [ORDER BY ...] [LIMIT $n OFFSET $m]
  m = s.match(/^SELECT (.+?) FROM (\w+)(?:\s+WHERE (.+?))?(?:\s+ORDER BY .+?)?(?:\s+LIMIT \$(\d+) OFFSET \$(\d+))?$/i);
  if (m) {
    const [, , tableName, where, limitIdx, offsetIdx] = m;
    let rows = filterRows(tbl(tableName), where, params);
    if (limitIdx && offsetIdx) {
      const limit = params[+limitIdx - 1] as number;
      const offset = params[+offsetIdx - 1] as number;
      rows = rows.slice(offset, offset + limit);
    }
    return { rows };
  }

  // ---- UPDATE ----
  // UPDATE table SET col1=$1, col2=$2 WHERE ...
  m = s.match(/^UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (m) {
    const [, tableName, setStr, whereStr] = m;
    const setEntries: [string, unknown][] = [];
    for (const part of setStr.split(',').map((p) => p.trim())) {
      const sm = part.match(/^(\w+)\s*=\s*\$(\d+)$/i);
      if (sm) setEntries.push([sm[1], params[+sm[2] - 1]]);
    }
    const rows = tbl(tableName);
    const filtered = filterRows(rows, whereStr, params);
    for (const row of filtered) {
      for (const [col, val] of setEntries) row[col] = val;
    }
    return { rows: filtered };
  }

  // ---- DELETE ----
  // DELETE FROM table WHERE ...
  m = s.match(/^DELETE FROM (\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (m) {
    const [, tableName, whereStr] = m;
    const before = tbl(tableName);
    const toDelete = filterRows(before, whereStr, params);
    const remaining = before.filter((r) => !toDelete.includes(r));
    tables.set(tableName, remaining);
    return { rows: toDelete };
  }

  // ---- TRUNCATE ----
  m = s.match(/^TRUNCATE (.+?)(?:\s+RESTART IDENTITY CASCADE)?$/i);
  if (m) {
    m[1].split(',').forEach((t) => {
      tables.delete(t.trim());
      sequences.delete(t.trim());
    });
    return { rows: [] };
  }

  // CREATE / DDL — no-op
  if (/^(CREATE|SELECT 1)/i.test(s)) return { rows: [{ '?column?': 1 }] };

  return { rows: [] };
}

// ---- MockPool ----

export class MockPool {
  async query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> {
    return runQuery(sql, params);
  }
  async connect() {
    return { query: async (sql: string) => runQuery(sql), release: () => {} };
  }
  async end() {}
  on(_: string, __: unknown) {}
}

// Jest globalSetup (no DB connection needed)
export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
  process.env.ADMIN_TOKEN = 'test-admin-token';
}
