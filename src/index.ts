import 'dotenv/config';
import { createApp } from './app';
import { migrate } from './db';
import { startEventIndexer } from './eventIndexer';

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

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close();
    });
  })
  .catch((err) => {
    console.error('Failed to migrate DB', err);
    process.exit(1);
  });
