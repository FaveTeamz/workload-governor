"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const redis_1 = require("../services/redis");
const validation_1 = require("../middleware/validation");
const admin_1 = require("../schemas/admin");
const router = (0, express_1.Router)();
function authMiddleware(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (token !== process.env.ADMIN_TOKEN) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    next();
}
// GET /api/admin/metrics
router.get('/metrics', authMiddleware, (req, res) => {
    const metrics = (0, redis_1.getMetrics)();
    res.json({
        cache: metrics,
    });
});
// POST /api/admin/maintainers  body: { address, org_id }
router.post('/maintainers', authMiddleware, (0, validation_1.validateRequest)({ body: admin_1.addMaintainerSchema }), async (req, res) => {
    const { address, org_id } = req.body;
    try {
        await db_1.pool.query(`INSERT INTO maintainers (address, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [address, org_id]);
        res.status(201).json({ address, org_id });
    }
    catch {
        res.status(500).json({ error: 'internal server error' });
    }
});
exports.default = router;
