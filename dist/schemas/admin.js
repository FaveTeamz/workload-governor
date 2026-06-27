"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMaintainerSchema = void 0;
const zod_1 = require("zod");
exports.addMaintainerSchema = zod_1.z.object({
    address: zod_1.z.string().min(1, 'address is required'),
    org_id: zod_1.z.string().min(1, 'org_id is required'),
});
