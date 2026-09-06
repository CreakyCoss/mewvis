// Static preview on the already-running desktop Vite server. No extra service.
import { mountPreview } from "@isle/plugin-dev/preview";
import App from "../../plugin-host/plugins/chat-playground/main/App";
import config from "../../plugin-host/plugins/chat-playground/isle.config";
import manifest from "../../plugin-host/plugins/chat-playground/package.json";

const dispose = await mountPreview(App, {
  ...config,
  name: manifest.name,
  version: manifest.version,
  tools: [
    { name: "chat_playground_echo", description: "调试回显", parameters: {} },
    { name: "chat_playground_inspect_text", description: "Node 文本分析", parameters: {} },
  ],
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
