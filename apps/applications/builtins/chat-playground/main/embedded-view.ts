import { getApplicationViewClient } from "@mewvis/app-sdk/views";

// This entry is bundled separately and runs inside the isolated child document.
const client = getApplicationViewClient();
const main = document.createElement("main");
const eyebrow = document.createElement("p");
eyebrow.className = "eyebrow";
eyebrow.textContent = "内嵌视图 · 独立沙箱";
const title = document.createElement("h3");
title.textContent = "一个独立的小应用";
const message = document.createElement("p");
message.className = "message";
message.setAttribute("role", "status");
message.textContent = "等待父应用发送消息。";
const button = document.createElement("button");
button.type = "button";
button.textContent = "请求父应用计数 +1";
const result = document.createElement("p");
result.setAttribute("role", "status");
result.textContent = "计数：0";
button.onclick = async () => {
  button.disabled = true;
  try {
    const count = await client.request<number>("counter.increment");
    result.textContent = "计数：" + count;
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
};
client.subscribe((value) => {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  )
    message.textContent = value.message;
});
main.append(eyebrow, title, message, button, result);
document.body.append(main);
