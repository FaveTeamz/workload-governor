import type { Request, Response, NextFunction } from "express";
import { StrKey } from "@stellar/stellar-sdk";
import nacl from "tweetnacl";
import logger from "../logger.js";

export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  return typeof fwd === "string" ? fwd.split(",")[0]!.trim() : (req.socket.remoteAddress ?? "unknown");
}

export function verifyEd25519Signature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  try {
    const decodedKey = StrKey.decodeEd25519PublicKey(publicKey);
    const messageBuffer = Buffer.from(message, "utf-8");
    const signatureBuffer = Buffer.from(signature, "base64");
    return nacl.sign.detached.verify(messageBuffer, signatureBuffer, decodedKey);
  } catch {
    return false;
  }
}

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const adminAddress = req.headers["x-admin-address"] as string | undefined;
  const adminSignature = req.headers["x-admin-signature"] as string | undefined;
  const adminTimestamp = req.headers["x-admin-timestamp"] as string | undefined;
  const clientIp = getClientIp(req);

  // Case 1: Bearer API Key authentication
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey) {
      logger.warn({ ip: clientIp, path: req.path }, "ADMIN_API_KEY environment variable is not configured");
      res.status(403).json({ error: "forbidden", message: "Admin API key authentication is not configured" });
      return;
    }

    if (token !== expectedKey) {
      logger.warn({ ip: clientIp, path: req.path }, "Invalid admin API key provided");
      res.status(403).json({ error: "forbidden", message: "Invalid admin API key" });
      return;
    }

    (req as Request & { adminUser?: string }).adminUser = "api-key-admin";
    logger.info(
      { ip: clientIp, path: req.path, method: req.method, actor: "api-key-admin" },
      "Admin authenticated via API key",
    );
    next();
    return;
  }

  // Case 2: Cryptographic Ed25519 signature authentication
  if (adminAddress || adminSignature || adminTimestamp) {
    if (!adminAddress || !adminSignature || !adminTimestamp) {
      res.status(401).json({
        error: "unauthorized",
        message: "Missing required signature authentication headers (X-Admin-Address, X-Admin-Signature, X-Admin-Timestamp)",
      });
      return;
    }

    // Verify timestamp within 300s (5-minute window) to prevent replay attacks
    const parsedTimestamp = parseInt(adminTimestamp, 10);
    if (isNaN(parsedTimestamp)) {
      res.status(403).json({ error: "forbidden", message: "Invalid timestamp format" });
      return;
    }

    const currentSeconds = Math.floor(Date.now() / 1000);
    const normalizedTimestamp = parsedTimestamp > 1e11 ? Math.floor(parsedTimestamp / 1000) : parsedTimestamp;
    const deltaSeconds = Math.abs(currentSeconds - normalizedTimestamp);

    if (deltaSeconds > 300) {
      logger.warn({ ip: clientIp, adminAddress, deltaSeconds }, "Admin signature rejected: timestamp out of 300s window");
      res.status(403).json({ error: "forbidden", message: "Timestamp expired or out of allowed 300s window" });
      return;
    }

    // Verify Ed25519 signature
    const message = `${req.method}:${req.path}:${adminTimestamp}`;
    let isValid = verifyEd25519Signature(adminAddress, message, adminSignature);
    if (!isValid) {
      isValid = verifyEd25519Signature(adminAddress, adminTimestamp, adminSignature);
    }

    if (!isValid) {
      logger.warn({ ip: clientIp, adminAddress }, "Admin signature verification failed");
      res.status(403).json({ error: "forbidden", message: "Invalid cryptographic signature" });
      return;
    }

    (req as Request & { adminAddress?: string }).adminAddress = adminAddress;
    logger.info(
      { ip: clientIp, path: req.path, method: req.method, actor: adminAddress },
      "Admin authenticated via Ed25519 signature",
    );
    next();
    return;
  }

  // Case 3: Missing authentication
  res.status(401).json({
    error: "unauthorized",
    message: "Administrator authentication required via Bearer API key or Ed25519 signature",
  });
}

export default adminAuth;
