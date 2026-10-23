import 'dotenv/config';
import { createApp } from './app';
import { migrate } from './db';
import { startEventIndexer, registerShutdownHandlers } from './eventIndexer';

const PORT = process.env.PORT ?? 3000;

migrate()
  .then(() => {
    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    startEventIndexer().catch((err) => {
      console.error('Failed to start event indexer', err);
    });

    // Register SIGTERM/SIGINT handlers to complete the current ledger batch,
    // release the Redis leader lock, and close the DB pool cleanly.
    registerShutdownHandlers();

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing HTTP server');
      server.close();
    });
  })
  .catch((err) => {
    console.error('Failed to migrate DB', err);
    process.exit(1);
  });
