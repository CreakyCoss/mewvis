let sequence = 0;
export const createTimestampId = (prefix: string) => `${prefix}-${Date.now()}-${++sequence}`;
export const getCurrentTimestamp = () => Date.now();
