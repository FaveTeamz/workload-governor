import { describe, it, expect } from 'vitest'
import { escapeCSVField, toCSV } from './csvUtils'

describe('escapeCSVField', () => {
  it('returns normal fields unchanged', () => {
    expect(escapeCSVField('hello')).toBe('hello')
    expect(escapeCSVField('GABC123')).toBe('GABC123')
    expect(escapeCSVField('stellar-org')).toBe('stellar-org')
  })

  it('wraps field containing a comma in double quotes', () => {
    expect(escapeCSVField('a,b')).toBe('"a,b"')
    expect(escapeCSVField('my-org,has-comma,123')).toBe('"my-org,has-comma,123"')
  })

  it('doubles internal double quotes and wraps in double quotes', () => {
    expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""')
    expect(escapeCSVField('"quoted"')).toBe('"""quoted"""')
  })

  it('wraps field containing a newline (LF) in double quotes', () => {
    expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('wraps field containing CRLF in double quotes', () => {
    expect(escapeCSVField('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('empty string produces empty field without quotes', () => {
    expect(escapeCSVField('')).toBe('')
  })

  it('snapshot: full CSV row with mixed special characters', () => {
    // contributor has both a comma and a double quote
    // orgId has a newline
    const contributor = 'GABC..,"org"'
    const orgId       = 'my-org\nwith-newline'
    const issueId     = 'issue-42'
    const status      = 'assigned'

    const result = [contributor, orgId, issueId, status].map(escapeCSVField).join(',')

    // contributor → "GABC..,""org"""  (comma + doubled quotes + wrap)
    // orgId       → "my-org\nwith-newline"  (newline + wrap)
    // issueId / status → no special chars, unchanged
    expect(result).toBe('"GABC..,""org""","my-org\nwith-newline",issue-42,assigned')
  })
})

describe('toCSV', () => {
  it('produces a header row followed by data rows separated by CRLF', () => {
    const csv = toCSV(
      ['name', 'value'],
      [{ name: 'Alice', value: '1' }, { name: 'Bob', value: '2' }],
    )
    expect(csv).toBe('name,value\r\nAlice,1\r\nBob,2')
  })

  it('handles empty rows array (header only, no CRLF)', () => {
    const csv = toCSV(['col1', 'col2'], [])
    expect(csv).toBe('col1,col2')
  })

  it('escapes fields with commas in data rows', () => {
    const csv = toCSV(
      ['contributor', 'org'],
      [{ contributor: 'GABC', org: 'org,with,commas' }],
    )
    expect(csv).toBe('contributor,org\r\nGABC,"org,with,commas"')
  })

  it('uses empty string for missing keys (produces empty column)', () => {
    const csv = toCSV(['a', 'b', 'c'], [{ a: 'x' } as Record<string, string>])
    expect(csv).toBe('a,b,c\r\nx,,')
  })
})
