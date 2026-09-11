import { win32 } from "node:path";

export const path = win32;
// Root-relative paths depend on the current drive; device namespaces are not resource roots.
export const isAbsolutePath = (value: string) =>
  /^[a-z]:[\\/]/i.test(value) || /^\\\\(?![?.][\\/])[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value);
export const preserveResourcePath = (_value: string) => false;
export const resourceVariables = (): Record<string, string> => ({
  programData: process.env.ProgramData ?? "C:\\ProgramData",
});
