import 'dotenv/config';
import { createApp } from './app';
import { migrate, pool } from './db';
import { startScheduler, stopScheduler } from './scheduler';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  try {
    await migrate();
    const app = createApp();
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });

    // Start scheduler for GitHub issues sync
    const orgsEnv = process.env.GITHUB_ORGS ?? '';
    const orgs = orgsEnv
      .split(',')
      .map((org) => org.trim())
      .filter((org) => org.length > 0);

    if (orgs.length > 0) {
      startScheduler(orgs);
    }

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`${signal} received, starting graceful shutdown...`);

      stopScheduler();

      server.close(async () => {
        console.log('HTTP server closed');
        await pool.end();
        console.log('Database pool closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
