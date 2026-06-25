"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// GET /api/issues?org_id=&status=
router.get('/', async (req, res) => {
    const { org_id, status } = req.query;
    const conditions = [];
    const params = [];
    if (org_id) {
        params.push(org_id);
        conditions.push(`org_id = $${params.length}`);
    }
    if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
        const { rows } = await db_1.pool.query(`SELECT * FROM issues ${where} ORDER BY id`, params);
        res.json(rows);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
exports.default = router;
