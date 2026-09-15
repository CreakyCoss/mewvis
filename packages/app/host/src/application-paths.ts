import { join } from "node:path";

const reserved = /^(?:data|packages|pnpm-store|con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const component = (value: string) =>
  [...Buffer.from(value)]
    .map((byte, index) =>
      ((byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57) || byte === 45 || byte === 95) &&
      !(index === 0 && reserved.test(value))
        ? String.fromCharCode(byte)
        : `%${byte.toString(16).padStart(2, "0")}`,
    )
    .join("");

/** Full package identity stays readable; escaping is injective even on case-insensitive filesystems. */
export function applicationDirectory(root: string, id: string): string {
  const scoped = /^@([^/]+)\/([^/]+)$/.exec(id);
  const parts = scoped ? [`@${component(scoped[1])}`, component(scoped[2])] : [component(id)];
  if (!id || parts.some((part) => part.length > 200)) {
    const encoded = Buffer.from(id).toString("hex") || "empty";
    return join(root, ".ids", ...encoded.match(/.{1,96}/g)!);
  }
  return join(root, ...parts);
}

export function legacyApplicationDirectory(root: string, id: string): string {
  return join(
    root,
    "data",
    ...(Buffer.from(id)
      .toString("hex")
      .match(/.{1,96}/g) ?? []),
  );
}
