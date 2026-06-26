"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./db");
const cache_1 = require("./cache");
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
async function start() {
    try {
        console.log('Initializing application...');
        await (0, db_1.migrate)();
        await (0, cache_1.initRedis)();
        const app = (0, app_1.createApp)();
        const server = app.listen(PORT, HOST, () => {
            console.log(`Server running on http://${HOST}:${PORT}`);
        });
        const shutdown = async (signal) => {
            console.log(`\n${signal} received, shutting down gracefully...`);
            server.close(async () => {
                console.log('HTTP server closed');
                await (0, cache_1.closeRedis)();
                await db_1.pool.end();
                console.log('Database connection closed');
                process.exit(0);
            });
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (err) {
        console.error('Failed to start application:', err);
        process.exit(1);
    }
}
start();
