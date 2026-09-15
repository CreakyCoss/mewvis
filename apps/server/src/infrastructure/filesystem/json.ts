import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { exists } from "./paths.js";
export async function jsonRead(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, "utf8"));
}
export async function jsonOptional(path: string): Promise<any> {
  return (await exists(path)) ? jsonRead(path) : null;
}
export async function atomicText(path: string, value: string) {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.tmp-${randomUUID()}`);
  try {
    const file = await fs.open(tmp, "wx", 0o600);
    try {
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(tmp, path);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
export async function jsonWrite(path: string, value: unknown) {
  await atomicText(path, JSON.stringify(value, null, 2));
}
