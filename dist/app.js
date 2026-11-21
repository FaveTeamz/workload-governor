"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const issues_1 = __importDefault(require("./routes/issues"));
const contributors_1 = __importDefault(require("./routes/contributors"));
const admin_1 = __importDefault(require("./routes/admin"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const events_1 = __importDefault(require("./routes/events"));
const logger_1 = require("./logger");
const swagger_1 = require("./swagger");
function createApp() {
    const app = (0, express_1.default)();
    // Security middleware
    app.use((0, helmet_1.default)());
    // CORS middleware
    const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
    app.use((0, cors_1.default)({
        origin: corsOrigins,
        credentials: true,
    }));
    // Logging middleware
    app.use((0, morgan_1.default)('combined'));
    // JSON parser middleware
    app.use(express_1.default.json());
    app.use(express_1.default.static('public'));
    app.use(logger_1.correlationIdMiddleware);
    (0, swagger_1.setupSwagger)(app);
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api/issues', issues_1.default);
    app.use('/api/contributors', contributors_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api/transactions', transactions_1.default);
    app.use('/api/events', events_1.default);
    app.use(logger_1.errorHandler);
    return app;
}
