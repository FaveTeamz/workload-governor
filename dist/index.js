"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./db");
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
async function start() {
    try {
        await (0, db_1.migrate)();
        const app = (0, app_1.createApp)();
        const server = app.listen(PORT, HOST, () => {
            console.log(`Server running on http://${HOST}:${PORT}`);
        });
        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`${signal} received, starting graceful shutdown...`);
            server.close(async () => {
                console.log('HTTP server closed');
                await db_1.pool.end();
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
    }
    catch (err) {
        console.error('Failed to start server', err);
        process.exit(1);
    }
}
start();
