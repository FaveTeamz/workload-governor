"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const soroban_1 = require("../soroban");
const router = (0, express_1.Router)();
const soroban = new soroban_1.SorobanService();
function isValidStellarAddress(address) {
    if (typeof address !== 'string')
        return false;
    try {
        new stellar_sdk_1.Address(address);
        return true;
    }
    catch {
        return false;
    }
}
function isValidOrgId(orgId) {
    if (typeof orgId !== 'string')
        return false;
    return orgId.length > 0 && orgId.length <= 256;
}
function isValidIssueId(issueId) {
    const num = Number(issueId);
    return Number.isInteger(num) && num > 0;
}
function isValidSequence(sequence) {
    if (typeof sequence !== 'string')
        return false;
    const num = BigInt(sequence);
    return num >= 0n;
}
async function buildAndSimulate(res, buildFn) {
    try {
        const tx = buildFn();
        const estimate = await soroban.simulate(tx);
        const response = {
            xdr: tx.toXDR(),
            fee: estimate.fee,
            instructions: estimate.instructions,
            readBytes: estimate.readBytes,
            writeBytes: estimate.writeBytes,
        };
        res.json(response);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'transaction simulation failed';
        res.status(400).json({ error: msg });
    }
}
router.post('/apply', (req, res) => {
    const { contributor, org_id, issue_id, sequence } = req.body;
    const errors = [];
    if (!isValidStellarAddress(contributor)) {
        errors.push({ field: 'contributor', message: 'invalid stellar address' });
    }
    if (!isValidOrgId(org_id)) {
        errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
    }
    if (!isValidIssueId(issue_id)) {
        errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
    }
    if (!isValidSequence(sequence)) {
        errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'validation failed', details: errors });
        return;
    }
    buildAndSimulate(res, () => soroban.buildApplyTx(contributor, org_id, Number(issue_id), sequence));
});
router.post('/withdraw', (req, res) => {
    const { contributor, org_id, issue_id, sequence } = req.body;
    const errors = [];
    if (!isValidStellarAddress(contributor)) {
        errors.push({ field: 'contributor', message: 'invalid stellar address' });
    }
    if (!isValidOrgId(org_id)) {
        errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
    }
    if (!isValidIssueId(issue_id)) {
        errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
    }
    if (!isValidSequence(sequence)) {
        errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'validation failed', details: errors });
        return;
    }
    buildAndSimulate(res, () => soroban.buildWithdrawTx(contributor, org_id, Number(issue_id), sequence));
});
router.post('/assign', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    const errors = [];
    if (!isValidStellarAddress(maintainer)) {
        errors.push({ field: 'maintainer', message: 'invalid stellar address' });
    }
    if (!isValidStellarAddress(contributor)) {
        errors.push({ field: 'contributor', message: 'invalid stellar address' });
    }
    if (!isValidOrgId(org_id)) {
        errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
    }
    if (!isValidIssueId(issue_id)) {
        errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
    }
    if (!isValidSequence(sequence)) {
        errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'validation failed', details: errors });
        return;
    }
    buildAndSimulate(res, () => soroban.buildAssignTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
router.post('/complete', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    const errors = [];
    if (!isValidStellarAddress(maintainer)) {
        errors.push({ field: 'maintainer', message: 'invalid stellar address' });
    }
    if (!isValidStellarAddress(contributor)) {
        errors.push({ field: 'contributor', message: 'invalid stellar address' });
    }
    if (!isValidOrgId(org_id)) {
        errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
    }
    if (!isValidIssueId(issue_id)) {
        errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
    }
    if (!isValidSequence(sequence)) {
        errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'validation failed', details: errors });
        return;
    }
    buildAndSimulate(res, () => soroban.buildCompleteTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
router.post('/revoke', (req, res) => {
    const { maintainer, contributor, org_id, issue_id, sequence } = req.body;
    const errors = [];
    if (!isValidStellarAddress(maintainer)) {
        errors.push({ field: 'maintainer', message: 'invalid stellar address' });
    }
    if (!isValidStellarAddress(contributor)) {
        errors.push({ field: 'contributor', message: 'invalid stellar address' });
    }
    if (!isValidOrgId(org_id)) {
        errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
    }
    if (!isValidIssueId(issue_id)) {
        errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
    }
    if (!isValidSequence(sequence)) {
        errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'validation failed', details: errors });
        return;
    }
    buildAndSimulate(res, () => soroban.buildRevokeTx(maintainer, contributor, org_id, Number(issue_id), sequence));
});
exports.default = router;
