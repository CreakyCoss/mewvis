import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chat, usePluginChatSession, useChatSnapshot, type ComposerBinding } from "@isle/plugin-sdk/chat/react";
const input = {
  workspaceId: "workspace",
  chatId: "logical-id",
  profile: { id: "fixture", systemPrompt: "Business context", useKnowledge: true },
};
function Editor(binding: ComposerBinding) {
  return (
    <textarea
      aria-label="业务输入框"
      disabled={binding.disabled}
      value={binding.draft.text}
      onChange={(event) => {
        const text = event.target.value;
        binding.setDraft({ text, blocks: [{ type: "text", content: text }] });
      }}
      style={{ padding: 16, minHeight: 90 }}
    />
  );
}
function Status() {
  const state = useChatSnapshot();
  return (
    <output>
      会话状态：{state.phase}；模型：{state.config.selectedModelId}
    </output>
  );
}
function Views() {
  const { session, error } = usePluginChatSession(input);
  if (!session) return <Chat.Loading error={error} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "80vh", gap: 12 }}>
      <section aria-label="默认 Chat">
        <Chat session={session} />
      </section>
      <section aria-label="组合 Chat">
        <Chat.Provider session={session} viewId="business">
          <Chat.Layout>
            <header>
              业务聊天 <Status />
            </header>
            <Chat.Messages
              renderMessage={(message, node) => (
                <div data-custom-message={message.role} style={{ borderLeft: "3px solid #8b5cf6" }}>
                  {node}
                </div>
              )}
            />
            <Chat.Footer>
              <Chat.Error />
              <Chat.Question />
              <Chat.Composer slots={{ editor: Editor }}>
                <span>业务工具栏</span>
              </Chat.Composer>
            </Chat.Footer>
          </Chat.Layout>
        </Chat.Provider>
      </section>
    </div>
  );
}
function App() {
  const [visible, show] = useState(true);
  return (
    <>
      <button onClick={() => show(!visible)}>{visible ? "卸载视图" : "挂载视图"}</button>
      {visible && <Views />}
    </>
  );
}
const container = document.createElement("div");
document.body.append(container);
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
