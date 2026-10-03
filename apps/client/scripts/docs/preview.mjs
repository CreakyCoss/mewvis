import { productId } from "@mewvis/product-config";
import { sandboxDocument } from "../../src/workbench/pages/applications/application-frame.tsx";
import script from "../../../applications/builtins/docs-reader/app-ui.js?raw";
import style from "../../../applications/builtins/docs-reader/app-ui.css?raw";
import book from "../../../../docs/.generated/book.json";
import { createLibrary } from "../../../applications/builtins/docs-reader/library.js";

const iframe = document.querySelector("iframe");
const library = createLibrary(book);
let theme = "light";
let failNextRead = false;
const tools = {
  [productId("_docs_catalog")]: () => library.catalog(),
  [productId("_docs_read")]: ({ id }) => {
    if (failNextRead) {
      failNextRead = false;
      throw new Error("模拟读取失败，请重试。");
    }
    return library.read(id);
  },
  [productId("_docs_search")]: ({ query }) => library.search(query),
};
let channel;
function post(message) {
  iframe.contentWindow.postMessage({ channel, ...message }, "*");
}
window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  const message = event.data;
  if (!message || typeof message.channel !== "string") return;
  if (message.type === "application:ready") {
    channel = message.channel;
    post({
      type: "host:init",
      host: {
        theme,
        application: { id: "@mewvis/docs-reader", name: "文档中心", version: "0.1.0" },
        tools: Object.keys(tools).map((name) => ({ name })),
      },
    });
  } else if (message.type === "tool:execute") {
    try {
      if (!Object.hasOwn(tools, message.toolName)) throw new Error("无权调用此工具");
      post({
        type: "host:result",
        id: message.id,
        result: { value: tools[message.toolName](message.args), content: [], meta: {} },
      });
    } catch (error) {
      post({ type: "host:result", id: message.id, error: error.message });
    }
  } else if (message.type === "host:open-external") {
    document.querySelector("#result").textContent = `外部链接请求：${message.url}`;
    post({ type: "host:result", id: message.id, result: { opened: true } });
  } else if (message.type === "application:error") {
    document.querySelector("#result").textContent = message.message;
  }
});
iframe.srcdoc = sandboxDocument({ script, style });
document.querySelector("#theme").onclick = (event) => {
  theme = theme === "light" ? "dark" : "light";
  event.target.textContent = theme === "light" ? "切换深色" : "切换浅色";
  post({ type: "host:theme", theme });
};
document.querySelector("#width").onclick = (event) => {
  const narrow = !iframe.style.maxWidth;
  iframe.style.maxWidth = narrow ? "390px" : "";
  event.target.textContent = narrow ? "宽屏" : "窄屏";
};
document.querySelector("#failure").onclick = () => {
  failNextRead = true;
};
