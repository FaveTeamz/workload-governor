"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const db_1 = require("../db");
const router = (0, express_1.Router)();
function isValidStellarAddress(address) {
    try {
        new stellar_sdk_1.Address(address);
        return true;
    }
    catch {
        return false;
    }
}
router.get('/:address/applications', async (req, res) => {
    const { address } = req.params;
    if (!isValidStellarAddress(address)) {
        res.status(400).json({ error: 'invalid stellar address format' });
        return;
    }
    try {
        const { rows } = await db_1.pool.query(`SELECT a.contributor, a.org_id, a.issue_id, a.created_at, i.title, i.status
       FROM applications a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1
       ORDER BY a.created_at DESC`, [address]);
        res.json(rows);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal server error';
        res.status(500).json({ error: msg });
    }
});
router.get('/:address/assignments', async (req, res) => {
    const { address } = req.params;
    if (!isValidStellarAddress(address)) {
        res.status(400).json({ error: 'invalid stellar address format' });
        return;
    }
    try {
        const { rows } = await db_1.pool.query(`SELECT a.contributor, a.org_id, a.issue_id, a.created_at, i.title, i.status
       FROM assignments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1
       ORDER BY a.created_at DESC`, [address]);
        res.json(rows);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal server error';
        res.status(500).json({ error: msg });
    }
});
router.get('/:address/counts', async (req, res) => {
    const { address } = req.params;
    if (!isValidStellarAddress(address)) {
        res.status(400).json({ error: 'invalid stellar address format' });
        return;
    }
    try {
        const applicationsResult = await db_1.pool.query(`SELECT COUNT(*) as count FROM applications WHERE contributor = $1`, [address]);
        const totalApplications = parseInt(applicationsResult.rows[0]?.count || '0', 10);
        const assignmentsResult = await db_1.pool.query(`SELECT COUNT(*) as count FROM assignments WHERE contributor = $1`, [address]);
        const totalAssignments = parseInt(assignmentsResult.rows[0]?.count || '0', 10);
        const byOrgResult = await db_1.pool.query(`SELECT
        org_id,
        COALESCE(SUM(CASE WHEN type = 'application' THEN 1 ELSE 0 END), 0) as applications,
        COALESCE(SUM(CASE WHEN type = 'assignment' THEN 1 ELSE 0 END), 0) as assignments
       FROM (
         SELECT org_id, 'application' as type FROM applications WHERE contributor = $1
         UNION ALL
         SELECT org_id, 'assignment' as type FROM assignments WHERE contributor = $1
       ) combined
       GROUP BY org_id
       ORDER BY org_id`, [address]);
        const response = {
            totalApplications,
            totalAssignments,
            byOrganization: byOrgResult.rows.map((row) => ({
                org_id: row.org_id,
                applications: parseInt(row.applications, 10),
                assignments: parseInt(row.assignments, 10),
            })),
        };
        res.json(response);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal server error';
        res.status(500).json({ error: msg });
    }
});
exports.default = router;
