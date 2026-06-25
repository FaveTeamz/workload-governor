"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const soroban_1 = require("../soroban");
const router = (0, express_1.Router)();
const soroban = new soroban_1.SorobanService();
async function buildAndSimulate(res, buildFn) {
    try {
        const tx = buildFn();
        const estimate = await soroban.simulate(tx);
        res.json({ xdr: tx.toXDR(), ...estimate });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal error';
        res.status(400).json({ error: msg });
    }
}
// POST /api/transactions/apply
router.post('/apply', (req, res) => {
    const { contributor, org_id, issue_id, sequence } = req.body;
    if (!contributor || !org_id || issue_id == null || !sequence) {
        res.status(400).json({ error: 'contributor, org_id, issue_id, sequence required' });
        return;
    }
    buildAndSimulate(res, () => soroban.buildApplyTx(contributor, org_id, Number(issue_id), sequence));
});
// POST /api/transactions/withdraw
router.post('/withdraw', (req, res) => {
    const { contributor, org_id, issue_id, sequence } = req.body;
    if (!contributor || !org_id || issue_id == null || !sequence) {
        res.status(400).json({ error: 'contributor, org_id, issue_id, sequence required' });
        return;
    }
    buildAndSimulate(res, () => soroban.buildWithdrawTx(contributor, org_id, Number(issue_id), sequence));
});
// POST /api/transactions/assign
router.post('/assign', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
        res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
        return;
    }
    buildAndSimulate(res, () => soroban.buildAssignTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
// POST /api/transactions/complete
router.post('/complete', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
        res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
        return;
    }
    buildAndSimulate(res, () => soroban.buildCompleteTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
// POST /api/transactions/revoke
router.post('/revoke', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
        res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
        return;
    }
    buildAndSimulate(res, () => soroban.buildRevokeTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
exports.default = router;
