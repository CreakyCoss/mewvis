import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const version = "0.1.9";
// The same upstream crate and checksum used by the former Rust backend.
const sourceHash = "d0ba424237a9a5db2f6071f193319e2b6a32f7f3961debb2fbbfe67067abce3f";
const desktop = fileURLToPath(new URL("../../../desktop/", import.meta.url));
const cache = join(desktop, "src-tauri/target/sqlite-vec-cache", version);

export function windowsMachine(buffer) {
  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") return null;
  const offset = buffer.readUInt32LE(0x3c);
  if (offset + 6 > buffer.length || buffer.toString("ascii", offset, offset + 4) !== "PE\0\0") return null;
  return buffer.readUInt16LE(offset + 4);
}

async function sourceDirectory() {
  await mkdir(cache, { recursive: true });
  const archive = join(cache, "source.crate");
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== sourceHash) {
    const response = await fetch(`https://static.crates.io/crates/sqlite-vec/sqlite-vec-${version}.crate`);
    if (!response.ok) throw new Error(`下载 sqlite-vec 源码失败：HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== sourceHash)
      throw new Error("sqlite-vec 源码 SHA-256 校验失败");
    await writeFile(archive, bytes);
  }
  const source = join(cache, "source");
  await rm(source, { recursive: true, force: true });
  await mkdir(source);
  await run("tar", ["-xzf", archive, "-C", source, "--strip-components=1"]);
  return source;
}

export async function buildSqliteVecArm64(requiredVersion) {
  if (requiredVersion !== version) throw new Error(`ARM64 sqlite-vec 构建源码为 ${version}，依赖为 ${requiredVersion}`);
  const source = await sourceDirectory();
  const output = join(cache, "win-arm64");
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
  const dll = join(output, "vec0.dll");
  const args = ["/nologo", "/LD", "/MT", "/O2", `/I${source}`, `/Tc${join(source, "sqlite-vec.c")}`, "/Fevec0.dll"];
  let compiler = "cl.exe";
  let env = { ...process.env };
  if (process.platform !== "win32") {
    // cargo-xwin provisions the same CRT/SDK as the Tauri build. Read values as
    // data; never execute its shell exports. Its LIB paths identify the sysroot.
    const llvmPaths = ["/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin"];
    env.PATH = [...llvmPaths, env.PATH ?? ""].join(delimiter);
    const { stdout } = await run("cargo-xwin", ["env", "--target", "aarch64-pc-windows-msvc"], { env });
    const exported = (name) => {
      const value = stdout.match(new RegExp(`^export ${name}=(.+);$`, "m"))?.[1];
      if (!value) throw new Error(`cargo-xwin 缺少 ${name}，请更新 cargo-xwin`);
      return JSON.parse(value);
    };
    env.PATH = exported("PATH");
    env.LIB = exported("LIB");
    const libraries = env.LIB.split(";");
    const crtLibrary = libraries.find((path) => /[/\\]crt[/\\]lib[/\\]aarch64$/.test(path));
    if (!crtLibrary) throw new Error("cargo-xwin 未提供 ARM64 CRT");
    const sysroot = dirname(dirname(dirname(crtLibrary)));
    compiler = "clang-cl";
    args.unshift("--target=aarch64-pc-windows-msvc", "-fuse-ld=lld-link");
    for (const include of ["crt/include", "sdk/include/ucrt", "sdk/include/um", "sdk/include/shared"])
      args.push("/imsvc", join(sysroot, include));
    args.push("/link", "/MACHINE:ARM64", ...libraries.map((path) => `/LIBPATH:${path}`));
  } else {
    args.push("/link", "/MACHINE:ARM64");
  }
  console.log(`Compiling sqlite-vec ${version} for Windows ARM64...`);
  try {
    await run(compiler, args, { cwd: output, env });
  } catch (error) {
    throw new Error(
      "sqlite-vec ARM64 编译失败。Windows 请使用 ARM64 Native Tools 开发命令行；macOS/Linux 需要 LLVM 与 cargo-xwin。\n" +
        (error.stderr || error.stdout || error.message),
      { cause: error },
    );
  }
  if (windowsMachine(await readFile(dll)) !== 0xaa64) throw new Error("sqlite-vec DLL 不是 Windows ARM64 产物");
  // The crate does not include license files; pin them to its recorded upstream commit.
  const revision = "e9f598abfa0c06b328d8fe5da9c3760cce74be10";
  for (const license of ["LICENSE-MIT", "LICENSE-APACHE"]) {
    const path = join(cache, license);
    try {
      await readFile(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const response = await fetch(`https://raw.githubusercontent.com/asg017/sqlite-vec/${revision}/${license}`);
      if (!response.ok) throw new Error(`下载 sqlite-vec 许可证失败：HTTP ${response.status}`);
      await writeFile(path, await response.text());
    }
    await cp(path, join(output, license));
  }
  return output;
}
