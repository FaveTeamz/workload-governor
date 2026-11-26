/**
 * IngestionCoordinator.ts
 *
 * Orchestrates the full Soroban event ingestion pipeline:
 *   fetch (HorizonService) → decode (EventDecoderService)
 *     → validate (EventValidationService) → persist (EventRepository)
 *
 * Malformed or invalid events are quarantined without aborting the batch,
 * so a single bad event can never stall the entire ledger run.
 *
 * Implements issue #1245: Decouple event decoding logic from database
 * persistence transactions.
 */

import type { HorizonService } from "../HorizonService.js";
import {
  decodeContractEvents,
  partitionOutcomes,
  type RawContractEvent,
} from "./EventDecoderService.js";
import { validateContractEvent } from "./EventValidationService.js";
import { EventRepository, type PersistResult } from "./EventRepository.js";
import logger from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestionOptions {
  /** Soroban contract address to index */
  contractId: string;
  /** Ledger sequence to start from (inclusive) */
  startLedger: number;
  /** Maximum number of events to fetch per RPC call (default: 100) */
  limit?: number;
}

export interface IngestionSummary {
  contractId: string;
  startLedger: number;
  eventsFound: number;
  inserted: number;
  skipped: number;
  quarantined: number;
}

// ─── Coordinator ──────────────────────────────────────────────────────────────

export class IngestionCoordinator {
  constructor(
    private readonly horizon: HorizonService,
    private readonly repository: EventRepository,
  ) {}

  /**
   * Run one ingestion pass for the given contract starting from startLedger.
   *
   * @param options - Ingestion configuration
   * @returns       - Summary of events processed, inserted, and quarantined
   */
  async ingest(options: IngestionOptions): Promise<IngestionSummary> {
    const { contractId, startLedger, limit = 100 } = options;

    logger.info({ contractId, startLedger }, "IngestionCoordinator: starting ingestion pass");

    // ── 1. Fetch ──────────────────────────────────────────────────────────────
    const rawHorizonEvents = await this.horizon.fetchEvents(startLedger, undefined, limit);

    if (rawHorizonEvents.length === 0) {
      logger.info({ contractId, startLedger }, "IngestionCoordinator: no events to process");
      return { contractId, startLedger, eventsFound: 0, inserted: 0, skipped: 0, quarantined: 0 };
    }

    // Map HorizonEvent → RawContractEvent + parsed ScVal JSON.
    // The Soroban RPC returns events in a wrapper; here we normalise them into
    // the shape EventDecoderService expects.
    const raws: RawContractEvent[] = rawHorizonEvents.map((e) => ({
      xdr: (e as any).xdr ?? "",
      ledger: e.ledger,
      ledgerClosedAt: e.created_at,
      id: e.id,
      txHash: (e as any).transaction_hash ?? (e as any).txHash ?? "",
      eventIndex: Number((e as any).paging_token?.split("-")[1] ?? 0),
      contractId: (e as any).contract_id ?? contractId,
    }));

    const parseds = rawHorizonEvents.map((e) => ({
      topics: (e as any).topic ?? [],
      data: (e as any).value ?? null,
    }));

    // ── 2. Decode ─────────────────────────────────────────────────────────────
    const outcomes = decodeContractEvents(raws, parseds);
    const { decoded, errors: decodeErrors } = partitionOutcomes(outcomes);

    logger.info(
      { contractId, total: rawHorizonEvents.length, decoded: decoded.length, decodeErrors: decodeErrors.length },
      "IngestionCoordinator: decode pass complete",
    );

    // ── 3. Validate ───────────────────────────────────────────────────────────
    const valid = decoded.filter((event) => {
      const result = validateContractEvent(event);
      return result.valid;
    });

    const invalid = decoded.filter((event) => !validateContractEvent(event).valid);

    logger.info(
      { contractId, valid: valid.length, invalid: invalid.length },
      "IngestionCoordinator: validation pass complete",
    );

    // ── 4. Persist ────────────────────────────────────────────────────────────
    let persistResult: PersistResult = { inserted: 0, skipped: 0 };
    let quarantined = 0;

    if (valid.length > 0) {
      persistResult = await this.repository.persistEvents(valid);
    }

    // Quarantine decode errors
    if (decodeErrors.length > 0) {
      await this.repository.quarantineErrors(decodeErrors);
      quarantined += decodeErrors.length;
    }

    // Quarantine validation failures
    for (const event of invalid) {
      const result = validateContractEvent(event);
      const reason = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      await this.repository.quarantineInvalidEvent(event, reason);
      quarantined++;
    }

    const summary: IngestionSummary = {
      contractId,
      startLedger,
      eventsFound: rawHorizonEvents.length,
      inserted: persistResult.inserted,
      skipped: persistResult.skipped,
      quarantined,
    };

    logger.info(summary, "IngestionCoordinator: ingestion pass complete");

    return summary;
  }
}
