import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for at-rest secrets (Razorpay key secret + webhook
 * secret, etc.). AES-256-GCM with a 32-byte key from the RAZORPAY_KEK env
 * var.
 *
 * Format: `<iv-hex>.<authTag-hex>.<ciphertext-hex>`
 *
 * KEK rotation policy (per <acceptance_criteria>): generate a fresh KEK
 * with `openssl rand -hex 32` and re-encrypt rows by reading them with
 * the old KEK then writing back with the new one before flipping the env
 * var. Keep the old KEK around long enough to verify reads succeed.
 */

const ALG = "aes-256-gcm";
const IV_LEN = 12; // 96 bits — recommended for GCM
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.RAZORPAY_KEK;
  if (!hex) {
    throw new Error(
      "RAZORPAY_KEK env var is required. Generate with `openssl rand -hex 32`."
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `RAZORPAY_KEK must decode to exactly 32 bytes (got ${buf.length}).`
    );
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt empty plaintext");
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${ct.toString("hex")}`;
}

export function decryptSecret(encoded: string): string {
  if (!encoded) throw new Error("Cannot decrypt empty payload");
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error("Encoded secret must have shape <iv>.<tag>.<ciphertext>");
  }
  const [ivHex, tagHex, ctHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  if (iv.length !== IV_LEN) throw new Error("Invalid IV length");
  if (tag.length !== TAG_LEN) throw new Error("Invalid auth tag length");
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Mask a key for display — keeps first 4 / last 2 chars visible. */
export function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(s.length - 6)}${s.slice(-2)}`;
}
