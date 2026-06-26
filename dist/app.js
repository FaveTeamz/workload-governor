"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const issues_1 = __importDefault(require("./routes/issues"));
const contributors_1 = __importDefault(require("./routes/contributors"));
const admin_1 = __importDefault(require("./routes/admin"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const rate_limit_1 = require("./middleware/rate-limit");
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(rate_limit_1.globalLimiter);
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api/issues', issues_1.default);
    app.use('/api/contributors', contributors_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api/transactions', rate_limit_1.walletLimiter, transactions_1.default);
    app.use('/webhooks', webhooks_1.default);
    return app;
}
