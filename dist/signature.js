"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignature = verifySignature;
exports.parseAuthHeader = parseAuthHeader;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
function verifySignature(publicKey, message, signature) {
    try {
        const decodedKey = stellar_sdk_1.StrKey.decodeEd25519PublicKey(publicKey);
        const messageBuffer = Buffer.from(message, 'utf-8');
        const signatureBuffer = Buffer.from(signature, 'base64');
        return tweetnacl_1.default.sign.detached.verify(messageBuffer, signatureBuffer, decodedKey);
    }
    catch {
        return false;
    }
}
function parseAuthHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    try {
        const encoded = authHeader.slice(7);
        const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
        return {
            adminAddress: payload.admin_address,
            message: payload.message,
            signature: payload.signature,
        };
    }
    catch {
        return null;
    }
}
