import { access } from "node:fs/promises";

for (const name of ["chat-ui.js", "chat-ui.css", "chat-host.js"]) {
  try {
    await access(new URL(`../dist/${name}`, import.meta.url));
  } catch {
    throw new Error(`缺少开发运行时 ${name}；打包工具链前请执行 pnpm --filter desktop build:chat-ui`);
  }
}
