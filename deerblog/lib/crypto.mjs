import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

/* scrypt is deliberately memory-hard. Parameters are kept in the stored
   string so hashes can be upgraded later without logging everyone out. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltText, keyText] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    const actual = await scrypt(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
export const uid = (length = 12) => crypto.randomBytes(length).toString("base64url").slice(0, length);

/* Compare two short secrets without leaking their length through an early
   return. Used for preview links; session and CSRF checks use the same idea. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function passwordProblem(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (value.length > 200) return "Password is too long.";
  return "";
}
