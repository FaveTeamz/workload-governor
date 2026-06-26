import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { Express } from 'express';

export function setupSwagger(app: Express): void {
  const specFile = path.join(__dirname, '../openapi.yaml');
  const spec = yaml.parse(fs.readFileSync(specFile, 'utf-8'));

  if (process.env.NODE_ENV !== 'production') {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { swaggerUrl: '/openapi.yaml' }));
    app.get('/openapi.yaml', (_req, res) => {
      res.setHeader('Content-Type', 'application/yaml');
      res.sendFile(specFile);
    });
  }
}
