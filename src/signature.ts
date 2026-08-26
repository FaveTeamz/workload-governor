import { StrKey } from '@stellar/stellar-sdk';
import nacl from 'tweetnacl';

export function verifySignature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  try {
    const decodedKey = StrKey.decodeEd25519PublicKey(publicKey);
    const messageBuffer = Buffer.from(message, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'base64');

    return nacl.sign.detached.verify(messageBuffer, signatureBuffer, decodedKey);
  } catch {
    return false;
  }
}

export interface SignedMessage {
  adminAddress: string;
  message: string;
  signature: string;
}

export function parseAuthHeader(authHeader?: string): SignedMessage | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const encoded = authHeader.slice(7);
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    return {
      adminAddress: payload.admin_address,
      message: payload.message,
      signature: payload.signature,
    };
  } catch {
    return null;
  }
}
