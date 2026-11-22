"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = setupSwagger;
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
function setupSwagger(app) {
    const specFile = path_1.default.join(__dirname, '../openapi.yaml');
    const spec = yaml_1.default.parse(fs_1.default.readFileSync(specFile, 'utf-8'));
    if (process.env.NODE_ENV !== 'production') {
        app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(spec, { swaggerUrl: '/openapi.yaml' }));
        app.get('/openapi.yaml', (_req, res) => {
            res.setHeader('Content-Type', 'application/yaml');
            res.sendFile(specFile);
        });
    }
}
