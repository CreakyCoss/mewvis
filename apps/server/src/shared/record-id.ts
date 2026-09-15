import { randomBytes } from "node:crypto";
import { optionalString } from "./validation.js";

export function recordId(value: unknown): string {
  const id = optionalString(value, "id");
  // Match Rust's compact UUID v7 record IDs, including replacement of invalid/legacy IDs.
  if (id && /^[0-9a-f]{12}7[0-9a-f]{19}$/i.test(id)) return id;
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString("hex");
}
