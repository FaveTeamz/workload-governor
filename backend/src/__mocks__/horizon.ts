import type { HorizonAccount, HorizonEvent, HorizonTransaction } from "../HorizonService";

export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
export const ACCOUNT_ID = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

export const MOCK_ACCOUNT: HorizonAccount = {
  id: ACCOUNT_ID,
  sequence: "1234567890",
  balances: [{ balance: "100.0000000", asset_type: "native" }],
};

export const MOCK_TRANSACTION: HorizonTransaction = {
  id: "tx-123",
  hash: "e5a7b8c9d0",
  ledger: 500123,
  created_at: "2026-09-25T12:00:00Z",
  fee_charged: 100,
  operation_count: 1,
  successful: true,
  result_xdr: "AAAAAAAAAGQAAAAAAAAAAAAAAAA=",
};

export const MOCK_EVENTS: HorizonEvent[] = [
  {
    id: "0000500123-0000000001",
    type: "contract",
    ledger: 500123,
    created_at: "2026-09-25T12:00:00Z",
  },
];

export const MOCK_LEDGER = { sequence: 500123 };
