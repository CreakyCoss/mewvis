import { defineSkill } from "@isle/plugin-sdk";

// The toolchain registers this array with the host. React never imports this file.
export default [
  defineSkill({
    name: "__SKILL_NAME__",
    description:
      "分析文本的 Unicode 字符数、UTF-8 字节数和 SHA-256，并解释字符数与字节数的区别。",
    content: [
      "用户需要检查文本长度、编码或 SHA-256 时使用此技能。",
      "先确认要分析的原文，保留空格、换行和 emoji；没有原文时请用户提供。",
      "调用 __TOOL_NAME__，把原文放入 text 参数；仅接受 1–2000 个 Unicode 码点，不要悄悄截断文本。",
      "根据工具结果用表格列出字符数、UTF-8 字节数和 SHA-256。字符数按 Unicode 码点计数，不等于可见字形数。",
      "遇到中文或 emoji 时，简要解释为什么 UTF-8 字节数可能大于字符数。",
      "工具不可用或执行失败时说明原因；不要自行编造字符数、字节数或哈希值。",
    ].join("\n"),
  }),
];
