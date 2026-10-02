import type { ExecutionConfig } from "./types.js";

/** Bundled execution settings; independent of the approval policy. */
export const EXECUTION_CONFIG: ExecutionConfig = {
  enabled: true,
  backend: {
    name: "srt",
    version: "0.0.75",
    options: {
      protectedFileNames: [
        ".gitconfig",
        ".gitmodules",
        ".bashrc",
        ".bash_profile",
        ".zshrc",
        ".zprofile",
        ".profile",
        ".ripgreprc",
        ".mcp.json",
      ],
      protectedDirectories: [".vscode", ".idea", ".claude/commands", ".claude/agents", ".git/hooks", ".git/config"],
    },
    platforms: {
      posix: {
        systemWritePaths: [
          "/dev/stdout",
          "/dev/stderr",
          "/dev/null",
          "/dev/tty",
          "/dev/dtracehelper",
          "/dev/autofs_nowait",
          "/tmp/claude",
          "/private/tmp/claude",
          "${home}/.npm/_logs",
          "${home}/.claude/debug",
        ],
        temporaryDirectory: "/tmp/claude",
      },
      windows: {
        srtWinPath: "${runtime}/vendor/srt-win/${arch}/srt-win.exe",
        proxyPortRange: [60080, 60089],
        readGrantPaths: ["${workspace}", "${home}", "${runtime}", "${nodeDirectory}"],
        privateAccountProfile: true,
        policyStore: "${programData}/sandbox-runtime/mewvis-policy.sqlite",
        mandatorySearchDepth: 3,
      },
    },
  },
  baseline: {
    denyRead: ["${home}/.ssh", "${home}/.aws", "${home}/.gnupg"],
    denyWrite: [
      "${home}/.ssh",
      "${home}/.aws",
      "${home}/.gnupg",
      "${runtime}",
      "${workspace}/.git/hooks",
      "${workspace}/.git/config",
    ],
    deniedDomains: [],
  },
  profiles: [
    {
      mode: "ask",
      filesystem: {
        allowWrite: ["${workspace}", "${temp}"],
        denyRead: [],
        denyWrite: ["${workspace}/.env", "${workspace}/.pi", "${workspace}/.git", "${workspace}/.mewvis"],
      },
      network: {
        allow: "all",
        deny: [],
      },
    },
    {
      mode: "auto",
      filesystem: {
        allowWrite: ["${workspace}", "${temp}"],
        denyRead: [],
        denyWrite: ["${workspace}/.env", "${workspace}/.pi", "${workspace}/.git", "${workspace}/.mewvis"],
      },
      network: {
        allow: "all",
        deny: [],
      },
    },
    {
      mode: "full",
      filesystem: {
        allowWrite: ["${workspace}", "${home}", "${temp}"],
        denyRead: [],
        denyWrite: [],
      },
      network: {
        allow: "all",
        deny: [],
      },
    },
  ],
  environment: [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "SystemRoot",
    "SystemDrive",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "PATHEXT",
    "PI_CODING_AGENT_DIR",
  ],
};
