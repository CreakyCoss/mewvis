import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const data = await readFile(new URL("assets/platform.webp", root));
const source = `// Embedded from the approved Mewvis poster illustration.\nexport default ${JSON.stringify("data:image/webp;base64," + data.toString("base64"))};\n`;
if (Buffer.byteLength(source) > 128 * 1024)
  throw new Error("Illustration exceeds the workshop file limit");
await writeFile(
  fileURLToPath(new URL("source/src/art/platform.ts", root)),
  source,
);
