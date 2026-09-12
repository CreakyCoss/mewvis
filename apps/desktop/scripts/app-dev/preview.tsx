// Static preview on the already-running desktop Vite server. No extra service.
import { mountPreview } from "@isle/app-dev/preview";
import App from "../../app-host/apps/chat-playground/main/App";
import config from "../../app-host/apps/chat-playground/isle.config";
import manifest from "../../app-host/apps/chat-playground/package.json";

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
