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
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api/issues', issues_1.default);
    app.use('/api/contributors', contributors_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api/transactions', transactions_1.default);
    return app;
}
