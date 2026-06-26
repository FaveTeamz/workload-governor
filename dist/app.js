"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
const cache_1 = require("./cache");
const issues_1 = __importDefault(require("./routes/issues"));
const contributors_1 = __importDefault(require("./routes/contributors"));
const admin_1 = __importDefault(require("./routes/admin"));
const transactions_1 = __importDefault(require("./routes/transactions"));
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.get('/health', async (req, res) => {
        try {
            await (0, db_1.healthCheck)();
            const redisClient = (0, cache_1.getRedisClient)();
            await redisClient.ping();
            res.json({ status: 'healthy', database: 'connected', cache: 'connected' });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'unknown error';
            res.status(503).json({ status: 'unhealthy', error: msg });
        }
    });
    app.use('/api/issues', issues_1.default);
    app.use('/api/contributors', contributors_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api/transactions', transactions_1.default);
    return app;
}
