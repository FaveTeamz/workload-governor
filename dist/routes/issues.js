"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const redis_1 = require("../services/redis");
const validation_1 = require("../middleware/validation");
const issues_1 = require("../schemas/issues");
const router = (0, express_1.Router)();
// GET /api/issues?org_id=&status=
router.get('/', (0, validation_1.validateRequest)({ query: issues_1.issueQuerySchema }), async (req, res) => {
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
    const cacheKey = `issues:${org_id || 'all'}:${status || 'all'}`;
    try {
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const { rows } = await db_1.pool.query(`SELECT * FROM issues ${where} ORDER BY id`, params);
        await (0, redis_1.setCache)(cacheKey, rows, 30);
        res.json(rows);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
// GET /api/issues/:id
router.get('/:id', (0, validation_1.validateRequest)({ params: issues_1.issueParamsSchema }), async (req, res) => {
    const { id } = req.params;
    const cacheKey = `issue:${id}`;
    try {
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const { rows } = await db_1.pool.query('SELECT * FROM issues WHERE id = $1', [
            id,
        ]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'issue not found' });
        }
        await (0, redis_1.setCache)(cacheKey, rows[0], 30);
        res.json(rows[0]);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
// POST /api/issues
router.post('/', (0, validation_1.validateRequest)({ body: issues_1.createIssueSchema }), async (req, res) => {
    const { org_id, title, status } = req.body;
    try {
        const { rows } = await db_1.pool.query('INSERT INTO issues (org_id, title, status) VALUES ($1, $2, $3) RETURNING *', [org_id, title, status || 'open']);
        await (0, redis_1.invalidateCache)('issues:*');
        res.status(201).json(rows[0]);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
// PUT /api/issues/:id
router.put('/:id', (0, validation_1.validateRequest)({ params: issues_1.issueParamsSchema, body: issues_1.updateIssueSchema }), async (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;
    try {
        const { rows } = await db_1.pool.query('UPDATE issues SET title = COALESCE($1, title), status = COALESCE($2, status) WHERE id = $3 RETURNING *', [title || null, status || null, id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'issue not found' });
        }
        await (0, redis_1.invalidateCache)('issues:*');
        await (0, redis_1.invalidateCache)(`issue:${id}`);
        res.json(rows[0]);
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
exports.default = router;
