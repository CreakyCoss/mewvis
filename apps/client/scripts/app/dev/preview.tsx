// Static preview on the already-running desktop Vite server. No extra service.
import { mountPreview } from "@mewvis/app-dev/preview";
import App from "../../../../applications/builtins/chat-playground/main/App";
import config from "../../../../applications/builtins/chat-playground/mewvis.config";
import manifest from "../../../../applications/builtins/chat-playground/package.json";

const dispose = await mountPreview(App, {
  ...config,
  name: manifest.name,
  version: manifest.version,
  tools: [
    { name: "chat_playground_echo", description: "调试回显", parameters: {}, risk: "low" },
    { name: "chat_playground_inspect_text", description: "Node 文本分析", parameters: {}, risk: "low" },
    { name: "chat_playground_medium_risk", description: "中风险审批测试", parameters: {}, risk: "medium" },
  ],
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
