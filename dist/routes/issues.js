"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const cache_1 = require("../cache");
const router = (0, express_1.Router)();
const CACHE_TTL = 30;
router.get('/', async (req, res) => {
    try {
        const { org_id, status, search, page = '1', limit = '10' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const cacheKey = `issues:${org_id}:${status}:${search}:${pageNum}:${limitNum}`;
        const cached = await (0, cache_1.getCached)(cacheKey);
        if (cached) {
            res.json(cached);
            return;
        }
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
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`title ILIKE $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const countResult = await db_1.pool.query(`SELECT COUNT(*) as count FROM issues ${where}`, params);
        const total = parseInt(countResult.rows[0]?.count || '0', 10);
        const offset = (pageNum - 1) * limitNum;
        params.push(limitNum);
        params.push(offset);
        const { rows } = await db_1.pool.query(`SELECT * FROM issues ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        const response = {
            issues: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
        };
        await (0, cache_1.setCached)(cacheKey, response, CACHE_TTL);
        res.json(response);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'internal server error';
        res.status(500).json({ error: msg });
    }
});
exports.default = router;
