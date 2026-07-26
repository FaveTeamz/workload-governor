import https from "https";
import http from "http";
import { HorizonError } from "./HorizonError";

export interface HorizonAccount {
  id: string;
  sequence: string;
  balances: Array<{ balance: string; asset_type: string }>;
}

const DEFAULT_BASE_URL = "https://horizon-testnet.stellar.org";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

/* istanbul ignore next -- transport helpers */
function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    (url.startsWith("https") ? https : http)
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      })
      .on("error", reject);
  });
}

/* istanbul ignore next -- transport helpers */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class HorizonService {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async fetchAccount(accountId: string): Promise<HorizonAccount | null> {
    let retries = 0;

    const attempt = async (): Promise<HorizonAccount | null> => {
      const { status, body } = await get(
        `${this.baseUrl}/accounts/${accountId}`
      );

      if (status === 200) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          throw new HorizonError(200, "Malformed JSON in Horizon response");
        }
        const account = parsed as Record<string, unknown>;
        if (
          typeof account.id !== "string" ||
          typeof account.sequence !== "string" ||
          !Array.isArray(account.balances)
        ) {
          throw new HorizonError(200, "Unexpected Horizon account shape");
        }
        return parsed as HorizonAccount;
      }

      if (status === 404) return null;

      if (status === 429 && retries < MAX_RETRIES - 1) {
        retries++;
        await delay(BASE_DELAY_MS * 2 ** (retries - 1));
        return attempt();
      }

      throw new HorizonError(
        status,
        status === 429
          ? "Rate limited by Horizon after retries"
          : `Horizon responded with ${status}`
      );
    };

    return attempt();
  }
}
