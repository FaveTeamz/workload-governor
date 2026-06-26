"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalLimiter = void 0;
exports.walletLimiter = walletLimiter;
exports.cleanupExpiredLimits = cleanupExpiredLimits;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
};
const getWalletAddress = (req) => {
    const wallet = req.query.wallet || req.body?.wallet;
    return wallet ? String(wallet) : null;
};
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (req, res) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rateLimitInfo = req.rateLimit;
        const retryAfter = rateLimitInfo?.resetTime && typeof rateLimitInfo.resetTime === 'number'
            ? Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
            : 60;
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
            error: 'too many requests',
            retryAfter,
        });
    },
});
const walletLimitStore = new Map();
function walletLimiter(req, res, next) {
    const wallet = getWalletAddress(req);
    if (!wallet) {
        return next();
    }
    const now = Date.now();
    const limit = 10;
    const windowMs = 60 * 1000;
    let entry = walletLimitStore.get(wallet);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + windowMs };
        walletLimitStore.set(wallet, entry);
    }
    if (entry.count >= limit) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: 'wallet rate limit exceeded',
            retryAfter,
        });
    }
    entry.count++;
    next();
}
function cleanupExpiredLimits() {
    const now = Date.now();
    for (const [wallet, entry] of walletLimitStore.entries()) {
        if (now > entry.resetTime) {
            walletLimitStore.delete(wallet);
        }
    }
}
setInterval(cleanupExpiredLimits, 60 * 1000);
