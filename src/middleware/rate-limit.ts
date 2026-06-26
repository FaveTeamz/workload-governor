import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

const getWalletAddress = (req: Request): string | null => {
  const wallet = req.query.wallet || req.body?.wallet;
  return wallet ? String(wallet) : null;
};

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (req: Request, res: Response) => {
    const retryAfter = req.rateLimit?.resetTime
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 60;
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'too many requests',
      retryAfter,
    });
  },
});

const walletLimitStore: Map<
  string,
  { count: number; resetTime: number }
> = new Map();

export function walletLimiter(req: Request, res: Response, next: () => void) {
  const wallet = getWalletAddress(req);

  if (!wallet) {
    return next();
  }

  const now = Date.now();
  const limit = 10;
  const windowMs = 60 * 1000;

  let entry = walletLimitStore.get(wallet);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + windowMs };
    walletLimitStore.set(wallet, entry);
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'wallet rate limit exceeded',
      retryAfter,
    });
  }

  entry.count++;
  next();
}

export function cleanupExpiredLimits() {
  const now = Date.now();
  for (const [wallet, entry] of walletLimitStore.entries()) {
    if (now > entry.resetTime) {
      walletLimitStore.delete(wallet);
    }
  }
}

setInterval(cleanupExpiredLimits, 60 * 1000);
