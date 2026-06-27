import nock from "nock";
import { HorizonService, HorizonAccount } from "../HorizonService";
import { HorizonError } from "../HorizonError";

const BASE = "https://horizon-testnet.stellar.org";
const ACCOUNT_ID = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

const MOCK_ACCOUNT: HorizonAccount = {
  id: ACCOUNT_ID,
  sequence: "1234567890",
  balances: [{ balance: "100.0000000", asset_type: "native" }],
};

beforeEach(() => nock.cleanAll());
afterAll(() => nock.restore());

describe("HorizonService", () => {
  const svc = new HorizonService(BASE);

  it("returns a parsed account on 200", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(200, MOCK_ACCOUNT);

    const account = await svc.fetchAccount(ACCOUNT_ID);

    expect(account).toEqual(MOCK_ACCOUNT);
  });

  it("returns null on 404 without throwing", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(404, { status: 404 });

    const account = await svc.fetchAccount(ACCOUNT_ID);

    expect(account).toBeNull();
  });

  it("retries on 429 and throws HorizonError after exhausting retries", async () => {
    // Intercept all 3 retry attempts
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(429).persist();

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 429,
    });
  }, 10_000);

  it("throws HorizonError with status 200 on malformed JSON response", async () => {
    nock(BASE)
      .get(`/accounts/${ACCOUNT_ID}`)
      .reply(200, "{ not valid json !!!");

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 200,
      message: "Malformed JSON in Horizon response",
    });
  });

  it("throws HorizonError on unexpected account shape", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(200, { id: 123 });

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 200,
      message: "Unexpected Horizon account shape",
    });
  });

  it("throws HorizonError on non-200/404/429 status", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(500);

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 500,
    });
  });

  it("uses the default Horizon testnet base URL when constructed without arguments", async () => {
    const defaultSvc = new HorizonService();
    nock("https://horizon-testnet.stellar.org")
      .get(`/accounts/${ACCOUNT_ID}`)
      .reply(200, MOCK_ACCOUNT);

    const account = await defaultSvc.fetchAccount(ACCOUNT_ID);
    expect(account).toEqual(MOCK_ACCOUNT);
  });
});
