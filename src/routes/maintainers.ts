import { Router, Request, Response } from 'express';
import { SorobanService } from '../soroban';

/** Soroban `Symbol` org ids: 1-32 chars of [A-Za-z0-9_]. */
const ORG_ID_RE = /^[A-Za-z0-9_]{1,32}$/;
/** Stellar account (G…) or contract (C…) strkey. */
const ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;
/** How long a contract answer is reused, to keep page loads off the RPC. */
export const MAINTAINER_CACHE_TTL_MS = 60_000;

type MaintainerLookup = Pick<SorobanService, 'isMaintainer'>;

/**
 * GET /orgs/:orgId/maintainers/:address (#1261)
 *
 * Answers whether `address` is a registered maintainer of `orgId` by
 * simulating the contract's read-only `is_maintainer` view. The frontend uses
 * it to show or hide maintainer-only actions. On-chain authorization still
 * applies, so this is only a UX gate.
 *
 *   200 { org_id, address, is_maintainer }
 *   400 invalid org id / address
 *   502 the contract could not be queried. This is never reported as
 *       `false`, so an RPC outage cannot look like a revoked role.
 */
export function createMaintainersRouter(
  lookup: MaintainerLookup = new SorobanService(process.env.SOROBAN_RPC_URL || undefined),
  now: () => number = Date.now,
): Router {
  const router = Router();
  const cache = new Map<string, { value: boolean; at: number }>();

  router.get('/orgs/:orgId/maintainers/:address', async (req: Request, res: Response) => {
    const { orgId, address } = req.params;
    if (!ORG_ID_RE.test(orgId)) {
      res.status(400).json({ error: 'invalid_org_id', message: 'org_id must be 1-32 characters of [A-Za-z0-9_]' });
      return;
    }
    if (!ADDRESS_RE.test(address)) {
      res.status(400).json({ error: 'invalid_address', message: 'address must be a Stellar G… or C… address' });
      return;
    }

    const key = `${orgId}::${address}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < MAINTAINER_CACHE_TTL_MS) {
      res.json({ org_id: orgId, address, is_maintainer: hit.value });
      return;
    }

    try {
      const value = await lookup.isMaintainer(address, orgId);
      cache.set(key, { value, at: now() });
      res.json({ org_id: orgId, address, is_maintainer: value });
    } catch (err) {
      res.status(502).json({
        error: 'contract_unavailable',
        message: err instanceof Error ? err.message : 'could not query is_maintainer',
      });
    }
  });

  return router;
}

export default createMaintainersRouter;
