import { posix } from "node:path";

export const path = posix;
export const isAbsolutePath = (value: string) => posix.isAbsolute(value);
// Device paths are kernel endpoints, not ordinary symlink-resolved resources.
export const preserveResourcePath = (value: string) => value.startsWith("/dev/");
export const resourceVariables = (): Record<string, string> => ({});
