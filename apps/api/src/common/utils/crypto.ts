import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

const getKeyBuffer = (base64Key: string): Buffer => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be base64-encoded 32 bytes');
  }
  return key;
};

export const encryptText = (plaintext: string, base64Key: string): EncryptedPayload => {
  const key = getKeyBuffer(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
};

export const decryptText = (payload: EncryptedPayload, base64Key: string): string => {
  const key = getKeyBuffer(base64Key);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const encrypted = Buffer.from(payload.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
