import type { TextStatsApi } from "../protocol.js";

// 纯计算示例，不读取工作区，不访问网络，也不修改文件。
export const createTextStatsService = (): TextStatsApi => ({
  async inspect({ text }) {
    return {
      codePoints: [...text].length,
      utf8Bytes: Buffer.byteLength(text, "utf8"),
      lines: text === "" ? 0 : text.split(/\r\n|\r|\n/).length,
    };
  },
});
