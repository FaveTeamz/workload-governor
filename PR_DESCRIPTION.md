# feat: HorizonService with nock unit tests

Closes #78

## Summary

Adds a TypeScript `HorizonService` in a new `backend/` directory with full unit test coverage using `nock` to intercept HTTP calls — no real network access required.

## Changes

- `backend/src/HorizonError.ts` — typed error class carrying HTTP status code
- `backend/src/HorizonService.ts` — fetches Stellar Horizon accounts with exponential-backoff retry on 429
- `backend/src/__tests__/HorizonService.test.ts` — 7 tests covering all required scenarios
- `backend/package.json` — jest + ts-jest + nock dependencies
- `backend/tsconfig.json` — TypeScript config

## Test Scenarios

| # | Scenario | Status |
|---|---|---|
| 1 | 200 → returns parsed `HorizonAccount` | ✅ |
| 2 | 404 → returns `null` without throwing | ✅ |
| 3 | 429 → exponential backoff, throws `HorizonError` after retries exhausted | ✅ |
| 4 | Malformed JSON on 200 → throws `HorizonError` | ✅ |
| + | Unexpected account shape → throws `HorizonError` | ✅ |
| + | Non-200/404/429 status → throws `HorizonError` | ✅ |
| + | Default constructor uses testnet base URL | ✅ |

## Coverage

```
All files  | 100% stmts | 100% branch | 100% funcs | 100% lines
```

## Testing

```bash
cd backend
npm install
npm test
```
