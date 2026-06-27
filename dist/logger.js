"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.correlationIdMiddleware = correlationIdMiddleware;
exports.errorHandler = errorHandler;
const pino_1 = __importDefault(require("pino"));
const uuid_1 = require("uuid");
const logger = (0, pino_1.default)({
    transport: {
        target: 'pino/file',
    },
});
exports.logger = logger;
function correlationIdMiddleware(req, res, next) {
    req.correlationId = (0, uuid_1.v4)();
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info({
            correlationId: req.correlationId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            timestamp: new Date().toISOString(),
        });
    });
    next();
}
function errorHandler(err, _req, res) {
    const correlationId = _req.correlationId ?? 'unknown';
    logger.error({
        correlationId,
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
    });
    res.status(500).json({
        error: 'internal server error',
        correlationId,
    });
}
