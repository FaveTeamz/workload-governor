/**
 * src/telemetry.ts — OpenTelemetry database and service tracing instrumentation
 */

import { logger } from './logger';

export function initTelemetry(): void {
  try {
    // Dynamic import to support optional OpenTelemetry runtime packages
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

    registerInstrumentations({
      instrumentations: [
        new PgInstrumentation({
          enhancedDatabaseReporting: true,
        }),
      ],
    });
    logger.info('OpenTelemetry pg instrumentation registered successfully');
  } catch {
    // Graceful no-op when optional instrumentation packages are not present in test/local
  }
}
