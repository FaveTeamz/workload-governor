"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const soroban_1 = require("../soroban");
const signature_1 = require("../signature");
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
const soroban = new soroban_1.SorobanService();
async function signatureAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const signed = (0, signature_1.parseAuthHeader)(authHeader);
    if (!signed) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    if (!(0, signature_1.verifySignature)(signed.adminAddress, signed.message, signed.signature)) {
        logger_1.logger.warn({
            correlationId: req.correlationId,
            message: 'Invalid admin signature',
            adminAddress: signed.adminAddress,
        });
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    req.adminAddress = signed.adminAddress;
    next();
}
// POST /api/admin/maintainers
// Body: { maintainer_address, org_id, sequence }
// Returns unsigned transaction XDR for admin to sign
router.post('/maintainers', signatureAuthMiddleware, async (req, res) => {
    const adminReq = req;
    const { maintainer_address, org_id, sequence } = req.body;
    if (!maintainer_address || !org_id || !sequence) {
        res.status(400).json({
            error: 'maintainer_address, org_id, and sequence required',
        });
        return;
    }
    try {
        // Build the register_maintainer transaction
        const account = adminReq.adminAddress;
        const args = [
            new stellar_sdk_1.Address(maintainer_address).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(org_id, { type: 'symbol' }),
        ];
        const tx = soroban.buildRawTransaction(account, sequence, 'register_maintainer', args);
        // Store pending transaction for later verification
        await db_1.pool.query(`INSERT INTO pending_transactions (admin_address, org_id, maintainer_address, transaction_xdr, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (admin_address, maintainer_address, org_id) DO UPDATE
       SET transaction_xdr = $4, created_at = NOW()`, [account, org_id, maintainer_address, tx.toXDR()]);
        res.status(200).json({
            xdr: tx.toXDR(),
            message: 'Sign this transaction with your admin key and submit to /broadcast',
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal error';
        logger_1.logger.error({
            correlationId: adminReq.correlationId,
            error: msg,
            stack: err instanceof Error ? err.stack : undefined,
        });
        res.status(400).json({ error: msg });
    }
});
exports.default = router;
