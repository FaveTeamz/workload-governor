"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGitHubSignature = validateGitHubSignature;
exports.parseGitHubPayload = parseGitHubPayload;
const crypto_1 = __importDefault(require("crypto"));
function validateGitHubSignature(payload, signature, secret) {
    const hmac = crypto_1.default.createHmac('sha256', secret);
    hmac.update(payload);
    const digest = `sha256=${hmac.digest('hex')}`;
    return crypto_1.default.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
function parseGitHubPayload(body) {
    try {
        const payload = body;
        if (!payload.action || !payload.issue || !payload.repository) {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
}
