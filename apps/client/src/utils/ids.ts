import { format } from "date-fns";

const formatTimestampId = (date: Date) => format(date, "yyyyMMdd-HHmmss-SSS");

export const createUuid = () => crypto.randomUUID();

export const createShortId = (length = 8) => createUuid().replace(/-/g, "").slice(0, length);

export const createTimestampId = (prefix: string) => `${prefix}-${formatTimestampId(new Date())}-${createShortId()}`;
