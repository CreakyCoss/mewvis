import React, { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createChatSession, type ChatRuntime, type ChatSession } from "../../src/chat/core";
import { DesktopChatEnvironment, useDesktopChatRecord } from "../../src/chat/desktop/react";
import type { DesktopChatService } from "../../src/chat/desktop";
import { Chat, EmptyComposer, useChatComposer, type ComposerBinding } from "../../src/chat/react";
import { AgentRuntimeEventType as E } from "../../src/agent-client/wire";
import "../../src/App.css";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const results = document.getElementById("results")!;
const fixture = document.getElementById("fixture")!;
const assertions: string[] = [];
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  assertions.push(message);
  results.textContent = assertions.join("\n");
};
const delay = () => new Promise((resolve) => setTimeout(resolve, 0));
let root: Root;
let binding: ComposerBinding;
let defaultBinding: ComposerBinding;
function DefaultProbe() {
  defaultBinding = useChatComposer();
  return null;
}
function Probe() {
  binding = useChatComposer();
  return null;
}
function Editor(props: ComposerBinding) {
  return (
    <textarea
      aria-label="Custom editor"
      value={props.draft.text}
      onChange={(event) =>
        props.setDraft({ text: event.target.value, blocks: [{ type: "text", content: event.target.value }] })
      }
    />
  );
}
function Toolbar() {
  return <span>Business toolbar</span>;
}
let observer: any;
let subscriptions = 0;
let detaches = 0;
let dispatches = 0;
let saves = 0;
let prepareGate: Promise<any> | undefined;
let releasePreparation: (value: any) => void;
const runtime: ChatRuntime = {
  async subscribe(listener) {
    subscriptions++;
    observer = listener;
    return () => {
      detaches++;
    };
  },
  async prepare() {
    return (
      prepareGate ?? {
        dispatch: async () => {
          dispatches++;
        },
      }
    );
  },
  async abort() {},
  async answer(taskId, questionId) {
    observer({ taskId, event: { type: E.QuestionAnswered, questionId } });
  },
  async release() {},
};
const emit = (session: any, event: any) => observer({ taskId: session.getSnapshot().activeTaskId, event });
const models = [
  { value: "m", label: "Test model", selectedLabel: "Test model", description: "No credentials", isDefault: true },
];
async function run() {
  const session = await createChatSession({
    identity: { scope: "browser-test", id: "one" },
    runtime,
    storage: {
      async load() {
        return null;
      },
      async save() {
        saves++;
      },
    },
    catalog: {
      async load() {
        return { models };
      },
    },
  });
  root = createRoot(fixture);
  await act(async () => {
    root.render(
      <StrictMode>
        <Chat session={session} />
        <Chat.Provider session={session}>
          <DefaultProbe />
        </Chat.Provider>
        <Chat.Provider session={session} viewId="custom">
          <Chat.Messages className="custom-list" renderMessage={(message) => <div>Custom {message.role}</div>} />
          <Chat.Question />
          <Chat.Composer slots={{ editor: Editor, toolbar: Toolbar }}>
            <span>Extra business control</span>
          </Chat.Composer>
          <Probe />
        </Chat.Provider>
      </StrictMode>,
    );
  });
  assert(subscriptions === 1, "StrictMode and multiple providers create one runtime subscription");
  assert(fixture.querySelector('[contenteditable="true"]'), "Default Chat renders the existing Lexical editor");
  assert(fixture.querySelector('[aria-label="Custom editor"]'), "Custom composition replaces the editor");
  await act(async () => {
    defaultBinding.setDraft({ text: "external draft", blocks: [{ type: "text", content: "external draft" }] });
  });
  assert(
    fixture.querySelector('[contenteditable="true"]')?.textContent === "external draft",
    "Public draft updates synchronize the default editor across views",
  );
  assert(binding.draft.text === "", "Different view IDs keep independent drafts");
  await act(async () => {
    defaultBinding.setDraft({ text: "", blocks: [] });
  });
  assert(
    fixture.textContent?.includes("Business toolbar") && fixture.textContent?.includes("Extra business control"),
    "Toolbar replacement and child extension both render",
  );
  assert(fixture.querySelector(".custom-list"), "Message list style replacement renders");
  await act(async () => {
    binding.setDraft({ text: "custom send", blocks: [{ type: "text", content: "custom send" }] });
  });
  await act(async () => {
    await binding.submit();
  });
  assert(dispatches === 1, "Custom composer dispatches once through the shared session");
  assert(binding.draft.text === "", "Successful dispatch clears only the submitted draft");
  await act(async () => {
    emit(session, { type: E.TextDelta, delta: "Streaming answer" });
    emit(session, { type: E.Question, questionId: "q", question: "Choose a value" });
  });
  assert(
    fixture.textContent?.includes("Streaming answer") && fixture.textContent?.includes("Custom assistant"),
    "Default and custom messages project the same streamed turn",
  );
  const fields = Array.from(fixture.querySelectorAll('textarea[aria-label="回复 Agent 的问题"]'));
  assert(fields.length === 2 && fields[0].id !== fields[1].id, "Question fields in two views have distinct DOM IDs");
  await act(async () => {
    await session.answer({ questionId: "q", answer: "yes" });
    emit(session, { type: E.Done, text: "Streaming answer" });
  });
  assert(!fixture.textContent?.includes("Choose a value"), "Answering through the session updates both views");
  prepareGate = new Promise((resolve) => {
    releasePreparation = resolve;
  });
  await act(async () => {
    binding.setDraft({ text: "preserve this", blocks: [{ type: "text", content: "preserve this" }] });
  });
  let pending: Promise<any>;
  await act(async () => {
    pending = binding.submit();
    await delay();
  });
  const messageCount = session.getSnapshot().messages.length;
  await act(async () => {
    (
      fixture
        .querySelector('[aria-label="Custom editor"]')!
        .closest("form")!
        .querySelector('[aria-label="停止生成"]') as HTMLButtonElement
    ).click();
    await pending;
  });
  assert(
    session.getSnapshot().messages.length === messageCount,
    "Clicking Stop cannot submit the form again when the button becomes Send",
  );
  assert(
    binding.draft.text === "preserve this" && !binding.busy,
    "Stopping during preparation preserves draft and releases input waiting state",
  );
  await act(async () => {
    releasePreparation({
      dispatch: async () => {
        dispatches++;
      },
    });
    await delay();
  });
  assert(dispatches === 1, "Late preparation cannot dispatch a cancelled request");
  prepareGate = Promise.reject(new Error("Preparation failed"));
  prepareGate.catch(() => {});
  await act(async () => {
    await binding.submit();
  });
  assert(
    binding.draft.text === "preserve this" && binding.error.includes("Preparation failed"),
    "Preparation failure retains draft and exposes retryable error",
  );
  prepareGate = undefined;
  await act(async () => {
    await session.send({ text: "background" });
    root.unmount();
  });
  assert(detaches === 0, "Unmounting every provider leaves the owner subscription active");
  emit(session, { type: E.TextDelta, delta: "Background result" });
  emit(session, { type: E.Done, text: "Background result" });
  await session.flush();
  assert(
    session
      .getSnapshot()
      .messages.at(-1)
      ?.blocks.some((part: any) => part.content === "Background result") && saves > 0,
    "Background execution continues reducing and saving without mounted views",
  );
  root = createRoot(fixture);
  await act(async () => {
    root.render(
      <StrictMode>
        <Chat session={session} />
      </StrictMode>,
    );
  });
  assert(
    fixture.textContent?.includes("Background result") && subscriptions === 1,
    "Remount observes the existing session without duplicate execution",
  );
  await act(async () => {
    root.unmount();
    await session.close();
  });
  assert(detaches === 1, "Explicit owner close detaches runtime once");
  root = createRoot(fixture);
  await act(async () => {
    root.render(<EmptyComposer />);
  });
  assert(
    fixture.querySelector('[aria-label="发送消息"][disabled]'),
    "Pure composer renders without a session provider",
  );
  await act(async () => {
    root.unmount();
  });
  const pluginSession = await createChatSession({
    identity: { scope: "plugin:fixture:workspace:fixture", id: "plugin-record" },
    runtime,
    catalog: { load: async () => ({ models }) },
    storage: { load: async () => null, save: async () => {} },
  });
  const historyListeners = new Set<(session: ChatSession) => void>();
  const recordChanges = new Set<() => void>();
  let connected = false;
  let sessionOpens = 0;
  let historySession: ChatSession | undefined;
  const historyService = {
    openSession: async () => {
      sessionOpens++;
      throw new Error("Must resolve history ownership");
    },
    openRecord: async () => {
      if (!connected)
        return {
          history: {
            messages: pluginSession.getSnapshot().messages.length
              ? pluginSession.getSnapshot().messages
              : [
                  {
                    id: "archived",
                    role: "user" as const,
                    createdAt: 1,
                    blocks: [{ type: "text" as const, id: "text", content: "Archived plugin message" }],
                  },
                ],
            preferences: { showThinkingProcess: true, showToolCallProcess: true },
            reason: "插件已禁用或移除",
          },
        };
      return { session: pluginSession };
    },
    subscribeRecordChanges: (listener: () => void) => {
      recordChanges.add(listener);
      return () => {
        recordChanges.delete(listener);
      };
    },
    subscribe: (listener: (session: ChatSession) => void) => {
      historyListeners.add(listener);
      return () => {
        historyListeners.delete(listener);
      };
    },
    getLocation: () => ({ workspacePath: "fixture" }),
    viewPersistence: () => undefined,
  } as unknown as DesktopChatService;
  const historyInput = {
    identity: { scope: "workspace:fixture", id: "plugin-record" },
    workspacePath: "fixture",
    workspaceId: "fixture",
    origin: { kind: "builtin" as const, sceneId: "chat" },
    profile: { id: "workspace", systemPrompt: () => "" },
  };
  function HistoryView() {
    const { session, history, error, reload } = useDesktopChatRecord(historyInput);
    historySession = session;
    if (history)
      return (
        <Chat.History
          messages={history.messages}
          reason={history.reason}
          displayOptions={history.preferences}
          onRetry={reload}
        />
      );
    return session ? <Chat session={session} /> : <p>{error || "Loading"}</p>;
  }
  root = createRoot(fixture);
  await act(async () => {
    root.render(
      <StrictMode>
        <DesktopChatEnvironment service={historyService}>
          <HistoryView />
        </DesktopChatEnvironment>
      </StrictMode>,
    );
  });
  assert(
    fixture.textContent?.includes("Archived plugin message") && fixture.textContent?.includes("只读查看"),
    "An unavailable plugin retains readable history without creating an execution session",
  );
  assert(
    !fixture.querySelector('[contenteditable="true"]') &&
      !fixture.querySelector('[aria-label="发送消息"]') &&
      fixture.querySelector('[aria-label="复制消息"]'),
    "Read-only history allows copying but has no editor or send action",
  );
  await act(async () => {
    connected = true;
    historyListeners.forEach((listener) => listener(pluginSession));
  });
  assert(
    historySession === pluginSession && sessionOpens === 0,
    "An already mounted history page reconnects to the plugin owner when it becomes available",
  );
  assert(historyListeners.size === 1, "StrictMode leaves one history ownership observer");
  await act(async () => {
    await historySession!.send({ text: "continue from history" });
    emit(pluginSession, { type: E.TextDelta, delta: "Plugin continuation" });
    emit(pluginSession, { type: E.Done, text: "Plugin continuation" });
  });
  assert(
    fixture.textContent?.includes("Plugin continuation"),
    "History renders continuation through the original plugin session",
  );
  await act(async () => {
    connected = false;
    recordChanges.forEach((listener) => listener());
  });
  assert(
    fixture.textContent?.includes("Plugin continuation") &&
      fixture.textContent?.includes("只读查看") &&
      !fixture.querySelector('[contenteditable="true"]'),
    "Disabling a plugin switches an already open history page to read-only while retaining messages",
  );
  await act(async () => {
    connected = true;
    (
      Array.from(fixture.querySelectorAll("button")).find(
        (button) => button.textContent === "重新连接",
      ) as HTMLButtonElement
    ).click();
  });
  assert(
    historySession === pluginSession && fixture.querySelector('[contenteditable="true"]'),
    "Re-enabling the plugin can reconnect the original session from the read-only view",
  );
  await act(async () => {
    root.unmount();
  });
  assert(
    historyListeners.size === 0 && recordChanges.size === 0 && pluginSession.getSnapshot().phase === "idle",
    "Leaving history detaches its observer without closing the plugin session",
  );
  await pluginSession.close();
  results.textContent = `PASS ${assertions.length} assertions\n${assertions.join("\n")}`;
  results.style.whiteSpace = "pre-wrap";
}
run().catch((error) => {
  results.textContent = `FAIL ${String(error.stack || error)}\n${assertions.join("\n")}`;
  results.style.whiteSpace = "pre-wrap";
  console.error(error);
});
