import nock from "nock";
import { afterAll, afterEach } from "vitest";

const loopbackHost = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const unmocked = new Set<string>();
const realFetch = globalThis.fetch;

if (!nock.isActive()) nock.activate();
nock.disableNetConnect();
nock.enableNetConnect(loopbackHost);

function recordUnmockedHttp(request: { options?: { hostname?: string; host?: string; path?: string }; hostname?: string; host?: string; path?: string }) {
  const { hostname, host = hostname, path = "" } = request.options ?? request;
  if (host && !loopbackHost.test(host)) unmocked.add(`${host}${path}`);
}
nock.emitter.on("no match", recordUnmockedHttp);

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "object" && "url" in input ? input.url : input);
  if (loopbackHost.test(url.host)) return realFetch(input, init);

  const endpoint = url.origin + url.pathname;
  unmocked.add(endpoint);
  throw new Error(`Unmocked fetch request to ${endpoint}`);
};

afterEach(() => {
  const requests = [...unmocked];
  unmocked.clear();
  nock.cleanAll();
  if (requests.length) throw new Error(`Unmocked network requests: ${requests.join(", ")}`);
});

afterAll(() => {
  nock.emitter.removeListener("no match", recordUnmockedHttp);
  nock.enableNetConnect();
  nock.restore();
  globalThis.fetch = realFetch;
});
