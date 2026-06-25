"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// GET /api/contributors/:address/applications
router.get('/:address/applications', async (req, res) => {
    try {
        const { rows } = await db_1.pool.query(`SELECT a.*, i.title, i.status FROM applications a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1 ORDER BY a.created_at`, [req.params.address]);
        res.json(rows);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
// GET /api/contributors/:address/assignments
router.get('/:address/assignments', async (req, res) => {
    try {
        const { rows } = await db_1.pool.query(`SELECT a.*, i.title, i.status FROM assignments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1 ORDER BY a.created_at`, [req.params.address]);
        res.json(rows);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
exports.default = router;
