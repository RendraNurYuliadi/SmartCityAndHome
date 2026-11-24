import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const passwordKeyLength = 64;

function derivePasswordKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, passwordKeyLength, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, encodedSalt, encodedKey, extra] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey || extra !== undefined) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const storedKey = Buffer.from(encodedKey, "base64url");
  if (salt.length !== 16 || storedKey.length !== passwordKeyLength) return false;

  const suppliedKey = await derivePasswordKey(password, salt);
  return timingSafeEqual(storedKey, suppliedKey);
}
