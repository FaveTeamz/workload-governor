import { Router, Request, Response } from 'express';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

const router = Router();

const XDR_MAX_BYTES = 32 * 1024; // 32 KB string-length limit
const PARSE_TIMEOUT_MS = 50;

export interface ParseResult {
  valid: boolean;
  type: string;
  operations: number;
}

/**
 * Spawn a worker thread to parse XDR, enforcing a hard 50 ms wall-clock
 * timeout. The worker re-uses this same module file; when it detects it is
 * not the main thread, it immediately parses and posts back the result.
 *
 * Under ts-jest/ts-node the source `.ts` file is passed to the worker with
 * `execArgv: ['-r', 'ts-node/register']` so TypeScript is transpiled inside
 * the worker too.
 */
export function parseXdrInWorker(
  xdrString: string,
  network: string,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const workerFile = __filename;

    const execArgv = workerFile.endsWith('.ts')
      ? ['-r', 'ts-node/register']
      : [];

    const worker = new Worker(workerFile, {
      workerData: { xdrString, network },
      execArgv,
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('XDR parse timed out'));
    }, PARSE_TIMEOUT_MS);

    worker.once('message', (msg: { error?: string } & Partial<ParseResult>) => {
      clearTimeout(timer);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg as ParseResult);
      }
    });

    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Worker entry-point — only runs when loaded as a worker thread.
// ---------------------------------------------------------------------------
if (!isMainThread) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TransactionBuilder, Networks } = require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk');
  const { xdrString, network } = workerData as {
    xdrString: string;
    network: string;
  };
  try {
    const networkPassphrase =
      (Networks as Record<string, string>)[network] ?? network;
    const tx = TransactionBuilder.fromXDR(xdrString, networkPassphrase);
    parentPort!.postMessage({
      valid: true,
      type: tx.constructor.name,
      operations: tx.operations.length,
    });
  } catch (err) {
    parentPort!.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Indirection layer — allows tests to substitute a mock parser without
// re-importing the router.
// ---------------------------------------------------------------------------
export type ParseFn = (xdrString: string, network: string) => Promise<ParseResult>;

/** The active parse function; replace in tests via setParser(). */
let _parse: ParseFn = parseXdrInWorker;

/** Override the parse function (for testing). Pass undefined to restore default. */
export function setParser(fn: ParseFn | undefined): void {
  _parse = fn ?? parseXdrInWorker;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { xdr: xdrString, network = 'TESTNET' } = req.body as Record<string, unknown>;

  if (typeof xdrString !== 'string' || xdrString.length === 0) {
    res.status(400).json({ error: 'xdr field is required and must be a non-empty string' });
    return;
  }

  if (xdrString.length > XDR_MAX_BYTES) {
    res.status(413).json({
      error: `XDR string exceeds maximum allowed length of ${XDR_MAX_BYTES} characters`,
    });
    return;
  }

  if (typeof network !== 'string') {
    res.status(400).json({ error: 'network must be a string (e.g. "TESTNET" or "PUBLIC")' });
    return;
  }

  try {
    const result = await _parse(xdrString, network);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'XDR parse failed';
    if (message.includes('timed out')) {
      res
        .status(503)
        .json({ error: 'XDR parsing timed out — transaction may be malformed or oversized' });
    } else {
      res.status(400).json({ error: message });
    }
  }
});

export default router;
