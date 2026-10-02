import { command } from "../process/command.js";
import { ServiceError } from "../../shared/validation.js";

export interface PickerOptions {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}
export type NativePicker = (
  options: PickerOptions,
  signal: AbortSignal,
) => Promise<string[] | null>;

// Options are data in the child environment, never interpolated into executable source.
export const macScript = String.raw`
ObjC.import('Foundation');
const options = JSON.parse(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('MEWVIS_DIALOG_OPTIONS')));
const app = Application.currentApplication();
app.includeStandardAdditions = true;
const args = { withPrompt: options.title || (options.directory ? '选择目录' : '选择文件'), multipleSelectionsAllowed: !!options.multiple };
if (options.defaultPath) args.defaultLocation = Path(options.defaultPath);
const extensions = (options.filters || []).flatMap(filter => filter.extensions);
if (!options.directory && extensions.length && !extensions.includes('*')) args.ofType = extensions;
try {
  app.activate();
  const result = options.directory ? app.chooseFolder(args) : app.chooseFile(args);
  JSON.stringify((Array.isArray(result) ? result : [result]).map(path => path.toString()));
} catch (error) {
  if (error.errorNumber === -128) 'null';
  else throw error;
}
`;
export const windowsScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$options = $env:MEWVIS_DIALOG_OPTIONS | ConvertFrom-Json
$dialog = $null
try {
  if ($options.directory) {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    if ($options.title) { $dialog.Description = $options.title }
    if ($dialog.PSObject.Properties['UseDescriptionForTitle']) { $dialog.UseDescriptionForTitle = $true }
    if ($options.defaultPath) { $dialog.SelectedPath = $options.defaultPath }
  } else {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Multiselect = [bool]$options.multiple
    $dialog.CheckFileExists = $true
    if ($options.title) { $dialog.Title = $options.title }
    if ($options.defaultPath) { $dialog.InitialDirectory = $options.defaultPath }
    if ($options.filters) {
      $parts = @()
      foreach ($filter in $options.filters) {
        $parts += $filter.name
        $parts += (($filter.extensions | ForEach-Object { if ($_ -eq '*') { '*.*' } else { '*.' + $_ } }) -join ';')
      }
      $dialog.Filter = $parts -join '|'
    }
  }
  $result = $null
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    if ($options.directory) { $result = @($dialog.SelectedPath) } else { $result = @($dialog.FileNames) }
  }
  [Console]::Write((ConvertTo-Json -InputObject $result -Compress))
} finally { if ($dialog) { $dialog.Dispose() } }
`;

type Runner = typeof command;
export function createNativePicker(
  platform = process.platform,
  env = process.env,
  run: Runner = command,
): NativePicker {
  return async (options, signal) => {
    const childOptions = {
      env: { ...env, MEWVIS_DIALOG_OPTIONS: JSON.stringify(options) },
      signal,
      timeout: 300_000,
      allow: [1],
    };
    try {
      if (platform === "darwin" || platform === "win32") {
        if (platform === "win32" && options.directory && options.multiple)
          throw new ServiceError(
            400,
            "DIALOG_OPTION_UNSUPPORTED",
            "Windows 目录选择器暂不支持多选目录",
          );
        const result =
          platform === "darwin"
            ? await run(
                "/usr/bin/osascript",
                ["-l", "JavaScript", "-e", macScript],
                { ...childOptions, allow: [] },
              )
            : await run(
                "powershell.exe",
                [
                  "-NoProfile",
                  "-NonInteractive",
                  "-STA",
                  "-EncodedCommand",
                  Buffer.from(windowsScript, "utf16le").toString("base64"),
                ],
                { ...childOptions, allow: [] },
              );
        const value: unknown = JSON.parse(result.stdout.trim());
        if (value === null) return null;
        if (
          !Array.isArray(value) ||
          !value.length ||
          value.some((path) => typeof path !== "string")
        )
          throw new Error("选择器返回格式不正确");
        return value as string[];
      }
      if (platform !== "linux" || (!env.DISPLAY && !env.WAYLAND_DISPLAY))
        throw new ServiceError(
          503,
          "DIALOG_UNAVAILABLE",
          "系统选择器需要运行 Node 服务的电脑具有图形桌面，远程或无界面环境不支持此操作",
        );
      const args = [
        "--file-selection",
        `--title=${options.title || (options.directory ? "选择目录" : "选择文件")}`,
      ];
      if (options.directory) args.push("--directory");
      if (options.multiple) args.push("--multiple", "--separator=\x1f");
      if (options.defaultPath)
        args.push(`--filename=${options.defaultPath.replace(/\/$/, "")}/`);
      if (!options.directory)
        for (const filter of options.filters ?? [])
          args.push(
            `--file-filter=${filter.name} | ${filter.extensions.map((ext) => (ext === "*" ? "*" : `*.${ext}`)).join(" ")}`,
          );
      let result;
      try {
        result = await run("zenity", args, childOptions);
      } catch (error) {
        if (
          !(error instanceof ServiceError) ||
          error.code !== "COMMAND_UNAVAILABLE"
        )
          throw error;
        if (options.multiple)
          throw new ServiceError(
            503,
            "DIALOG_UNAVAILABLE",
            "多选文件需要安装 Zenity",
          );
        const fallback = [
          options.directory ? "--getexistingdirectory" : "--getopenfilename",
          options.defaultPath ?? env.HOME ?? "/",
        ];
        if (!options.directory)
          fallback.push(
            (options.filters ?? [])
              .map(
                (f) =>
                  `${f.extensions.map((ext) => (ext === "*" ? "*" : `*.${ext}`)).join(" ")} | ${f.name}`,
              )
              .join("\n"),
          );
        if (options.title) fallback.push("--title", options.title);
        result = await run("kdialog", fallback, childOptions);
      }
      if (result.code === 1) return null;
      const value = result.stdout.replace(/\r?\n$/, "");
      return value ? (options.multiple ? value.split("\x1f") : [value]) : null;
    } catch (error) {
      if (
        error instanceof ServiceError &&
        [
          "COMMAND_ABORTED",
          "COMMAND_TIMEOUT",
          "COMMAND_EXIT_UNCONFIRMED",
        ].includes(error.code)
      )
        throw error;
      if (error instanceof ServiceError && error.code.startsWith("DIALOG_"))
        throw error;
      throw new ServiceError(
        503,
        "DIALOG_UNAVAILABLE",
        "无法打开系统选择器，请检查桌面环境和系统权限；Linux 需要 Zenity 或 KDialog",
      );
    }
  };
}
export const pickNativeFile = createNativePicker();
