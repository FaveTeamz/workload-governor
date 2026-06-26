import 'dotenv/config';
import { createApp } from './app';
import { migrate, pool } from './db';
import { initRedis, closeRedis } from './cache';

const PORT = process.env.PORT ?? 3000;
const HOST = process.env.HOST ?? '0.0.0.0';

async function start(): Promise<void> {
  try {
    console.log('Initializing application...');
    await migrate();
    await initRedis();

    const app = createApp();
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      server.close(async () => {
        console.log('HTTP server closed');
        await closeRedis();
        await pool.end();
        console.log('Database connection closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

start();
