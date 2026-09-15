import { format } from "date-fns";

export type TimeInput = Date | number;

const toDate = (value: TimeInput) => (value instanceof Date ? value : new Date(value));

export const getCurrentTimestamp = () => Date.now();

export const formatCustomTime = (value: TimeInput, pattern: string) => format(toDate(value), pattern);

export const formatDate = (value: TimeInput) => formatCustomTime(value, "yyyy-MM-dd");

export const formatMonthDay = (value: TimeInput) => formatCustomTime(value, "MM-dd");

export const formatTime = (value: TimeInput) => formatCustomTime(value, "HH:mm");

export const formatTimeWithSeconds = (value: TimeInput) => formatCustomTime(value, "HH:mm:ss");

export const formatDateTime = (value: TimeInput) => formatCustomTime(value, "yyyy-MM-dd HH:mm");

export const formatDateTimeWithSeconds = (value: TimeInput) => formatCustomTime(value, "yyyy-MM-dd HH:mm:ss");

export const formatRelativeTime = (timestamp: number, now = getCurrentTimestamp()) => {
  const elapsed = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < hour) {
    return `${Math.max(1, Math.floor(elapsed / minute))} 分`;
  }

  if (elapsed < day) {
    return `${Math.floor(elapsed / hour)} 小时`;
  }

  if (elapsed < 7 * day) {
    return `${Math.floor(elapsed / day)} 天`;
  }

  return formatMonthDay(timestamp);
};
