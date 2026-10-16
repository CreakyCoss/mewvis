import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, posix } from "node:path";
import { tmpdir } from "node:os";
import { canonicalPath, containsPath } from "../platforms/resources.js";
import type { Operation, OperationAnalysis } from "./types.js";

type Segment = { words: string[]; next?: "&&" | "|" };
type FileOperation = Extract<Operation, { kind: "filesystem" }>;
type Decoded = { args: string[]; files: FileOperation[]; cwd?: string };

const builtins = new Set(["cd", "pwd", "echo", "printf"]);
const programs = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "rg",
  "sed",
  "mkdir",
  "touch",
]);
const programDirectories = [
  "/bin",
  "/usr/bin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
];
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** A literal-only Bash grammar. Anything requiring evaluation remains opaque. */
function parse(command: string): Segment[] | undefined {
  if (command.length > 65_536 || command.includes("\0")) return;
  const source = command.trim();
  const segments: Segment[] = [];
  let words: string[] = [];
  let word = "";
  let started = false;
  let quotes: "'" | '"' | undefined;
  const flush = () => {
    if (started) words.push(word);
    word = "";
    started = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quotes === "'") {
      if (char === "'") quotes = undefined;
      else word += char;
    } else if (char === "\\") {
      const next = source[++i];
      if (next === undefined) return;
      if (next !== "\n") {
        if (quotes === '"' && !["$", "`", '"', "\\"].includes(next))
          word += "\\";
        word += next;
        started = true;
      }
    } else if (quotes === '"') {
      if (char === '"') quotes = undefined;
      else if (char === "$" || char === "`") return;
      else word += char;
    } else if (char === "'" || char === '"') {
      quotes = char;
      started = true;
    } else if (char === " " || char === "\t") {
      flush();
    } else if (char === "|" || char === "&") {
      flush();
      if (!words.length || (char === "|" && source[i + 1] === "|")) return;
      if (char === "&" && source[++i] !== "&") return;
      segments.push({ words, next: char === "&" ? "&&" : "|" });
      words = [];
    } else if (/[\n\r;$`<>(){}*?\[\]~#]/.test(char)) {
      return;
    } else {
      word += char;
      started = true;
    }
    if (words.length > 2_048 || segments.length > 128) return;
  }
  if (quotes) return;
  flush();
  if (!words.length) return;
  segments.push({ words });
  return segments;
}

/** Resolve the first PATH match, never skip a workspace shim to find a safer binary. */
function executable(
  program: string,
  cwd: string,
  workspace: string,
): string | undefined {
  const name = posix.basename(program);
  if (
    !programs.has(name) ||
    (program.includes("/") && !posix.isAbsolute(program))
  )
    return;
  const trusted = (file: string) => {
    try {
      accessSync(file, constants.X_OK);
      const target = realpathSync(file);
      if (!statSync(target).isFile()) return;
      if (
        [
          workspace,
          canonicalPath(tmpdir()),
          "/tmp",
          "/private/tmp",
          "/var/tmp",
          "/private/var/tmp",
        ].some((root) => containsPath(root, file) || containsPath(root, target))
      )
        return;
      // Resolving a multicall symlink (e.g. cat -> busybox) changes argv[0] semantics.
      if (posix.basename(target) !== name) return;
      return target;
    } catch {
      return;
    }
  };
  if (posix.isAbsolute(program)) {
    const target = trusted(program);
    const directories = [
      ...programDirectories,
      ...(process.env.PATH ?? "").split(delimiter),
    ];
    return target &&
      directories.some(
        (directory) =>
          trusted(posix.resolve(cwd, directory || ".", name)) === target,
      )
      ? target
      : undefined;
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const file = posix.resolve(cwd, directory || ".", name);
    try {
      accessSync(file, constants.X_OK);
      if (!statSync(file).isFile()) continue;
    } catch {
      continue;
    }
    return trusted(file);
  }
}

function decode(
  name: string,
  input: string[],
  cwd: string,
): Decoded | undefined {
  const args = [...input];
  const files: FileOperation[] = [];
  const target = (raw: string) => {
    // Kernel path traversal and Bash's logical cd differ around symlink/.. .
    // Keep that syntax opaque rather than normalizing away an unchecked component.
    if (!raw || raw.split("/").includes(".."))
      throw new Error("unsupported path");
    return canonicalPath(posix.resolve(cwd, raw));
  };
  const file = (
    index: number,
    action: FileOperation["action"],
    recursive = false,
  ) => {
    const path = target(args[index]);
    args[index] = path;
    files.push({ kind: "filesystem", action, target: path, recursive });
  };
  const defaultDirectory = (
    action: FileOperation["action"],
    recursive = false,
  ) => {
    files.push({ kind: "filesystem", action, target: cwd, recursive });
  };
  if (name === "echo") return { args, files };
  if (name === "printf") {
    // Both -v and %n can assign shell variables; array subscripts can evaluate code.
    if (!args.length || (args[0].startsWith("-") && args[0] !== "--")) return;
    const format = args[args[0] === "--" ? 1 : 0];
    if (
      format === undefined ||
      format
        .replace(/%%|%[-+ #0]*\d*(?:\.\d+)?[sdiuoxXfFeEgGaAcbqQ]/g, "")
        .includes("%")
    )
      return;
    return { args, files };
  }
  if (name === "pwd")
    return args.every((arg) => arg === "-P") ? { args, files } : undefined;
  if (name === "cd") {
    while (args[0] === "-P") args.shift();
    if (args[0] === "--") args.shift();
    if (args.length !== 1 || args[0].startsWith("-")) return;
    const directory = target(args[0]);
    if (directory !== posix.resolve(cwd, args[0])) return;
    files.push({
      kind: "filesystem",
      action: "read",
      target: directory,
      recursive: false,
    });
    return { args: ["-P", "--", directory], files, cwd: directory };
  }
  if (name === "sed") {
    const script = args[0] === "-n" ? 1 : 0;
    // Only numeric-address print/quit programs; no r/w/e, script files or in-place writes.
    const lines = (args[script] ?? "").trim().replace(/;$/, "").split(/[;\n]/);
    if (!lines.every((line) => /^(?:\d+(?:,\d+)?)?[pq]$/.test(line.trim())))
      return;
    for (let i = script + 1; i < args.length; i++) {
      if (args[i].startsWith("-")) return;
      file(i, "read");
    }
    return { args, files };
  }
  if (name === "rg") {
    const switches = new Set([
      "--no-config",
      "--files",
      "--hidden",
      "--no-ignore",
      "--no-ignore-vcs",
      "--line-number",
      "--no-line-number",
      "--with-filename",
      "--no-filename",
      "--heading",
      "--no-heading",
      "--fixed-strings",
      "--ignore-case",
      "--smart-case",
      "--case-sensitive",
      "--word-regexp",
      "--line-regexp",
      "--count",
      "--count-matches",
      "--files-with-matches",
      "--files-without-match",
      "--quiet",
      "--invert-match",
      "--only-matching",
      "--multiline",
      "--multiline-dotall",
      "--pcre2",
      "--text",
      "--trim",
      "--null",
      "--no-messages",
      "--color=never",
      "--color=always",
      "--color=auto",
    ]);
    const values = new Set([
      "-e",
      "--regexp",
      "-f",
      "--file",
      "-g",
      "--glob",
      "--iglob",
      "-t",
      "--type",
      "-T",
      "--type-not",
    ]);
    const numbers = new Set([
      "-A",
      "--after-context",
      "-B",
      "--before-context",
      "-C",
      "--context",
      "-m",
      "--max-count",
      "--max-depth",
    ]);
    const operands: number[] = [];
    let options = true;
    let pattern = false;
    let listing = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (options && arg === "--") {
        options = false;
        continue;
      }
      if (!options || !arg.startsWith("-") || arg === "-") {
        operands.push(i);
        continue;
      }
      if (arg === "--files") listing = true;
      if (switches.has(arg) || /^-[inlcoqsvwFxUaH0]+$/.test(arg)) continue;
      const equal = arg.indexOf("=");
      if (equal > 0 && !arg.startsWith("--")) return;
      const option = equal > 0 ? arg.slice(0, equal) : arg;
      if (!values.has(option) && !numbers.has(option)) return;
      const valueIndex = equal > 0 ? i : ++i;
      const value = equal > 0 ? arg.slice(equal + 1) : args[valueIndex];
      if (value === undefined || (numbers.has(option) && !/^\d+$/.test(value)))
        return;
      if (["-e", "--regexp", "-f", "--file"].includes(option)) pattern = true;
      if (option === "-f" || option === "--file") {
        if (value !== "-") {
          const path = target(value);
          files.push({
            kind: "filesystem",
            action: "read",
            target: path,
            recursive: false,
          });
          args[valueIndex] = equal > 0 ? `${option}=${path}` : path;
        }
      }
    }
    if (!listing && !pattern && operands.shift() === undefined) return;
    if (!operands.length) defaultDirectory("search", true);
    for (const index of operands)
      if (args[index] !== "-") file(index, listing ? "list" : "search", true);
    // A user rg config can inject --pre and execute an otherwise invisible script.
    if (args[0] !== "--no-config") args.unshift("--no-config");
    return { args, files };
  }
  const shortFlags: Record<string, RegExp> = {
    ls: /^-[1aAdFhlprRSt]+$/,
    cat: /^-[benstuvABET]+$/,
    wc: /^-[clmwL]+$/,
    mkdir: /^-[pv]+$/,
    touch: /^-[amc]+$/,
    head: /^-[qv]+$/,
    tail: /^-[qv]+$/,
  };
  const operands: number[] = [];
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (options && arg === "--") {
      options = false;
      continue;
    }
    if (!options || !arg.startsWith("-") || arg === "-") {
      operands.push(i);
      continue;
    }
    if (shortFlags[name]?.test(arg)) continue;
    if (
      (name === "head" || name === "tail") &&
      (arg === "-n" || arg === "-c")
    ) {
      if (!/^[+-]?\d+$/.test(args[++i] ?? "")) return;
      continue;
    }
    if (
      (name === "head" || name === "tail") &&
      /^-(?:[nc][+-]?)?\d+$/.test(arg)
    )
      continue;
    if (name === "mkdir" && arg === "--parents") continue;
    return;
  }
  if ((name === "mkdir" || name === "touch") && !operands.length) return;
  const action =
    name === "mkdir" || name === "touch"
      ? "write"
      : name === "ls"
        ? "list"
        : "read";
  const recursive = name === "ls" && args.some((arg) => /^-[^-]*R/.test(arg));
  for (const index of operands) {
    if (name === "touch" && args[index] === "-") return;
    if (args[index] === "-" && ["cat", "head", "tail", "wc"].includes(name))
      continue;
    file(index, action, recursive);
  }
  if (name === "ls" && !operands.length) defaultDirectory("list", recursive);
  return { args, files };
}

/** The rendered command pins executable and operand paths before approval/execution. */
export function prepareBashExecution(
  command: string,
  workspacePath: string,
): {
  analysis: OperationAnalysis;
  command?: string;
} {
  const opaque = (): { analysis: OperationAnalysis } => ({
    analysis: {
      coverage: "partial",
      operations: [{ kind: "process", command, cwd: workspacePath }],
    },
  });
  // Git Bash and PowerShell need their own path and language semantics.
  if (process.platform === "win32") return opaque();
  const segments = parse(command);
  if (!segments) return opaque();
  try {
    const workspace = canonicalPath(workspacePath);
    let cwd = workspace;
    const operations: Operation[] = [];
    const rendered: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const { words, next } = segments[i];
      const argv = words[0] === "builtin" ? words.slice(1) : words;
      const name = posix.basename(argv[0] ?? "");
      const builtin = builtins.has(name) && argv[0] === name;
      if (words[0] === "builtin" && !builtin) return opaque();
      const program = builtin ? name : executable(argv[0], cwd, workspace);
      if (!program) return opaque();
      // cd in a pipeline executes in a subshell and cannot update the next cwd.
      if (name === "cd" && (next === "|" || segments[i - 1]?.next === "|"))
        return opaque();
      const decoded = decode(name, argv.slice(1), cwd);
      if (!decoded) return opaque();
      const line = [
        ...(builtin ? ["builtin", name] : [program]),
        ...decoded.args,
      ]
        .map(quote)
        .join(" ");
      operations.push(
        {
          kind: "process",
          command: line,
          cwd,
          decoded: {
            executable: program,
            args: decoded.args,
            filesystem: decoded.files.some((file) => file.action === "write")
              ? "write"
              : "read",
            targets: decoded.files.map((file) => file.target),
          },
        },
        ...decoded.files,
      );
      if (decoded.cwd) cwd = decoded.cwd;
      rendered.push(line, ...(next ? [next] : []));
    }
    return {
      analysis: { coverage: "complete", operations },
      command: rendered.join(" "),
    };
  } catch {
    return opaque();
  }
}
