const padIdPart = (value: number, length = 2) => value.toString().padStart(length, "0");

const formatTimestampId = (date: Date) =>
  [
    date.getFullYear(),
    padIdPart(date.getMonth() + 1),
    padIdPart(date.getDate()),
    "-",
    padIdPart(date.getHours()),
    padIdPart(date.getMinutes()),
    padIdPart(date.getSeconds()),
    "-",
    padIdPart(date.getMilliseconds(), 3),
  ].join("");

export const now = () => Date.now();

export const createTavernId = (prefix: string) => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${formatTimestampId(new Date())}-${suffix}`;
};
