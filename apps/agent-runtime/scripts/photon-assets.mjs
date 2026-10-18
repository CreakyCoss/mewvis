import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const piRequire = createRequire(
  import.meta.resolve("@earendil-works/pi-coding-agent"),
);
const photonEntry = piRequire.resolve("@silvia-odwyer/photon-node");

// Keep Photon's CJS module beside its WASM instead of folding __dirname into ESM.
// Every Runtime entry is in dist's root, including the constrained tool worker.
export const photonBundlePlugin = {
  name: "runtime-photon-assets",
  setup(build) {
    build.onResolve({ filter: /^@silvia-odwyer\/photon-node$/ }, () => ({
      path: "./vendor/photon/photon_rs.cjs",
      external: true,
    }));
  },
};

export async function copyPhotonAssets(outputDirectory) {
  const destination = join(outputDirectory, "vendor", "photon");
  await mkdir(destination, { recursive: true });
  await copyFile(photonEntry, join(destination, "photon_rs.cjs"));
  for (const name of ["photon_rs_bg.wasm", "LICENSE.md"])
    await copyFile(join(dirname(photonEntry), name), join(destination, name));
}
