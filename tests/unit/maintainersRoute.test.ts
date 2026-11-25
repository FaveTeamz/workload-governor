/**
 * #1261: GET /orgs/:orgId/maintainers/:address answers from the contract's
 * is_maintainer view, validates input, caches briefly, and reports RPC
 * failures as 502 (never as "not a maintainer").
 */
import { createMaintainersRouter, MAINTAINER_CACHE_TTL_MS } from '../../src/routes/maintainers';

const ADDR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

type Handler = (req: unknown, res: unknown) => Promise<void>;

function handlerOf(router: ReturnType<typeof createMaintainersRouter>): Handler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (router as any).stack.find((l: any) => l.route?.path === '/orgs/:orgId/maintainers/:address');
  return layer.route.stack[0].handle;
}

async function call(handler: Handler, orgId: string, address: string) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  await handler({ params: { orgId, address } }, res);
  return res;
}

describe('GET /orgs/:orgId/maintainers/:address', () => {
  it('returns the contract answer', async () => {
    const lookup = { isMaintainer: jest.fn().mockResolvedValue(true) };
    const res = await call(handlerOf(createMaintainersRouter(lookup)), 'org_1', ADDR);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ org_id: 'org_1', address: ADDR, is_maintainer: true });
    expect(lookup.isMaintainer).toHaveBeenCalledWith(ADDR, 'org_1');
  });

  it('rejects invalid org ids and addresses without querying the contract', async () => {
    const lookup = { isMaintainer: jest.fn() };
    const handler = handlerOf(createMaintainersRouter(lookup));
    expect((await call(handler, 'bad org!', ADDR)).statusCode).toBe(400);
    expect((await call(handler, 'org_1', 'not-an-address')).statusCode).toBe(400);
    expect(lookup.isMaintainer).not.toHaveBeenCalled();
  });

  it('reports contract failures as 502, not as false', async () => {
    const lookup = { isMaintainer: jest.fn().mockRejectedValue(new Error('rpc down')) };
    const res = await call(handlerOf(createMaintainersRouter(lookup)), 'org_1', ADDR);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: 'contract_unavailable' });
  });

  it('caches answers for MAINTAINER_CACHE_TTL_MS', async () => {
    let t = 0;
    const lookup = { isMaintainer: jest.fn().mockResolvedValue(false) };
    const handler = handlerOf(createMaintainersRouter(lookup, () => t));
    await call(handler, 'org_1', ADDR);
    t = MAINTAINER_CACHE_TTL_MS - 1;
    await call(handler, 'org_1', ADDR);
    expect(lookup.isMaintainer).toHaveBeenCalledTimes(1);
    t = MAINTAINER_CACHE_TTL_MS;
    await call(handler, 'org_1', ADDR);
    expect(lookup.isMaintainer).toHaveBeenCalledTimes(2);
  });
});
