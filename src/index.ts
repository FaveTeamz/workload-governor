/**
 * src/index.ts
 * Express server entry point for WorkloadGovernor backend.
 */
import express from 'express';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Error logging endpoint (used by frontend ErrorBoundary)
app.post('/api/errors', (req, res) => {
  const { message, stack, componentStack } = req.body as {
    message?: string;
    stack?: string;
    componentStack?: string;
  };
  // In production, forward to your observability stack (e.g., Sentry, CloudWatch)
  console.error('[ErrorBoundary]', { message, stack, componentStack });
  res.status(204).send();
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`WorkloadGovernor API listening on :${PORT}`);
});

export default app;
