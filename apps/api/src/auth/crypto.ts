import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

// OWASP-recommended minimum for scrypt. Tests pass a cheaper cost.
export const DEFAULT_SCRYPT: ScryptCost = { N: 2 ** 17, r: 8, p: 1 };

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { ...cost, maxmem: 256 * cost.N * cost.r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string, cost = DEFAULT_SCRYPT): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !N || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), { N: +N, r: +r, p: +p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A random token for cookies and links, plus the hash we store instead of it. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
