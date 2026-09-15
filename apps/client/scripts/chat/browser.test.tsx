import { agentPermissionOptions } from "../../src/agent-client/wire";
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
const questionAnswers: (string | null)[] = [];
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
  async answer(taskId, questionId, answer) {
    questionAnswers.push(answer);
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
        return {
          permissionOptions: structuredClone([...agentPermissionOptions]),
          models,
        };
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
    emit(session, {
      type: E.Question,
      questionId: "q",
      question: "Choose a value",
      expiresAt: Date.now() + 3 * 60_000,
    });
  });
  assert(
    fixture.textContent?.includes("Streaming answer") && fixture.textContent?.includes("Custom assistant"),
    "Default and custom messages project the same streamed turn",
  );
  const fields = Array.from(fixture.querySelectorAll('textarea[aria-label="回复 Agent 的问题"]'));
  assert(fields.length === 2 && fields[0].id !== fields[1].id, "Question fields in two views have distinct DOM IDs");
  const timers = Array.from(fixture.querySelectorAll('[role="timer"]'));
  assert(
    timers.length === 2 && timers.every((timer) => timer.textContent === "3:00"),
    "Question views display the same server deadline",
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1_100)));
  assert(
    timers.every((timer) => timer.textContent === "2:59"),
    "Question countdown advances while waiting for an answer",
  );
  await act(async () => {
    emit(session, {
      type: E.Question,
      questionId: "select-q",
      question: "Choose a value",
      expiresAt: Date.now() + 3 * 60_000,
      context: "Additional context",
      input: {
        type: "select",
        selected: "first",
        options: [
          { value: "first", label: "First option" },
          { value: "second value", label: "Second option" },
        ],
      },
    });
  });
  const radios = Array.from(fixture.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  assert(
    radios.length === 6 && radios[2].value === "other",
    "Select questions always include a free-text Other option",
  );
  assert(radios[0].checked && questionAnswers.length === 0, "A default question choice is selected without submitting");
  assert(radios[0].name !== radios[3].name, "Question choices in multiple views have independent radio groups");
  assert(
    radios[0].closest("form")!.innerText.includes("Additional context"),
    "Supplemental question context is visible without expanding anything",
  );
  await act(async () => radios[1].click());
  assert(radios[1].checked && questionAnswers.length === 0, "Choosing an answer waits for explicit submission");
  await act(async () => radios[2].click());
  assert(
    fixture.querySelector('textarea[aria-label="回复 Agent 的问题"]') &&
      radios[0].closest("form")!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,
    "A custom choice shows the answer field and requires text before replying",
  );
  await act(async () => radios[1].click());
  await act(async () => radios[0].closest("form")!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  assert(
    questionAnswers.length === 1 && questionAnswers[0] === "second value",
    "Reply submits the exact selected value once",
  );
  for (const type of ["text", "select"] as const) {
    await act(async () => {
      emit(session, {
        type: E.Question,
        questionId: `cancel-${type}`,
        question: "Optional question",
        expiresAt: Date.now() + 3 * 60_000,
        input: { type, options: [{ value: "other", label: "其他" }] },
      });
    });
    if (type === "select")
      assert(
        fixture.querySelectorAll('input[type="radio"]').length === 2,
        "An existing Other option is not duplicated",
      );
    const cancel = Array.from(fixture.querySelectorAll("button")).find((button) => button.textContent === "取消回答")!;
    assert(!cancel.disabled, `${type} questions can be cancelled without an answer`);
    await act(async () => cancel.click());
    assert(
      questionAnswers.at(-1) === null &&
        session.getSnapshot().pendingQuestion === null &&
        session.getSnapshot().phase === "running",
      `Cancelling a ${type} question releases the wait without stopping the task`,
    );
  }
  await act(async () =>
    emit(session, {
      type: E.Question,
      questionId: "expired-question",
      question: "Expired question",
      expiresAt: Date.now() - 1,
      input: { type: "text", selected: "late answer" },
    }),
  );
  assert(
    fixture.querySelector('[role="timer"]')?.textContent === "0:00" &&
      Array.from(fixture.querySelectorAll("button"))
        .filter((button) => button.textContent === "回复")
        .every((button) => button.disabled),
    "Expired questions show zero remaining time and cannot be answered",
  );
  await act(async () => emit(session, { type: E.QuestionAnswered, questionId: "expired-question", answer: null }));
  assert(
    !fixture.textContent?.includes("Expired question"),
    "Server expiration clears the pending question in every view",
  );
  await act(async () => {
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
  const applicationSession = await createChatSession({
    identity: { scope: "application:fixture:workspace:fixture", id: "application-record" },
    runtime,
    catalog: { load: async () => ({ permissionOptions: structuredClone([...agentPermissionOptions]), models }) },
    storage: { load: async () => null, save: async () => {} },
  });
  const historyListeners = new Set<(session: ChatSession) => void>();
  const recordChanges = new Set<() => void>();
  let connected = false;
  let connectionGate: Promise<void> | undefined;
  let releaseConnection: () => void;
  let connectionFailure: string | undefined;
  let historyReason = "应用已禁用或移除";
  let canRetry = true;
  let connectionAttempts = 0;
  let sessionOpens = 0;
  let historySession: ChatSession | undefined;
  const historyService = {
    listSessions: () => [applicationSession],
    subscribe: (listener: (session: ChatSession) => void) => {
      historyListeners.add(listener);
      return () => {
        historyListeners.delete(listener);
      };
    },
    openSession: async () => {
      sessionOpens++;
      throw new Error("Must resolve history ownership");
    },
    openRecord: async () => {
      connectionAttempts++;
      const available = connected;
      const failure = connectionFailure;
      await connectionGate;
      if (failure) throw new Error(failure);
      if (!available)
        return {
          history: {
            messages: applicationSession.getSnapshot().messages.length
              ? applicationSession.getSnapshot().messages
              : [
                  {
                    id: "archived",
                    role: "user" as const,
                    createdAt: 1,
                    blocks: [{ type: "text" as const, id: "text", content: "Archived application message" }],
                  },
                ],
            preferences: { showThinkingProcess: true, showToolCallProcess: true },
            reason: historyReason,
            canRetry,
          },
        };
      return { session: applicationSession };
    },
    subscribeRecord: (_input: unknown, listener: () => void) => {
      recordChanges.add(listener);
      const onSession = () => listener();
      historyListeners.add(onSession);
      return () => {
        recordChanges.delete(listener);
        historyListeners.delete(onSession);
      };
    },
    getLocation: () => ({ workspacePath: "fixture" }),
    viewPersistence: () => undefined,
  } as unknown as DesktopChatService;
  const historyInput = {
    identity: { scope: "workspace:fixture", id: "application-record" },
    workspacePath: "fixture",
    workspaceId: "fixture",
    origin: { kind: "builtin" as const, sceneId: "chat" },
    profile: { id: "workspace", systemPrompt: () => "" },
  };
  function HistoryView() {
    const { session, history, error, reload, connecting, retryError } = useDesktopChatRecord(historyInput);
    historySession = session;
    if (history)
      return (
        <Chat.History
          messages={history.messages}
          reason={history.reason}
          displayOptions={history.preferences}
          onRetry={history.canRetry ? reload : undefined}
          connecting={connecting}
          retryError={retryError}
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
    fixture.textContent?.includes("Archived application message") && fixture.textContent?.includes("只读查看"),
    "An unavailable application retains readable history without creating an execution session",
  );
  assert(
    !fixture.querySelector('[contenteditable="true"]') &&
      !fixture.querySelector('[aria-label="发送消息"]') &&
      fixture.querySelector('[aria-label="复制消息"]'),
    "Read-only history allows copying but has no editor or send action",
  );
  const retryButton = () =>
    Array.from(fixture.querySelectorAll("button")).find((button) => button.textContent === "重新连接")!;
  const finishRetryFeedback = () => act(async () => new Promise((resolve) => setTimeout(resolve, 450)));
  const idleButtonWidth = retryButton().getBoundingClientRect().width;
  const idleFooterHeight = fixture.querySelector('[role="status"]')!.parentElement!.getBoundingClientRect().height;
  await act(async () => {
    retryButton().click();
    await delay();
  });
  const loadingButton = fixture.querySelector<HTMLButtonElement>('button[aria-busy="true"]');
  assert(
    loadingButton?.disabled && loadingButton.textContent === "连接中…" && loadingButton.querySelector("svg"),
    "An immediately failed retry retains a visible loading spinner instead of flashing",
  );
  assert(
    loadingButton?.getBoundingClientRect().width === idleButtonWidth &&
      fixture.querySelector('[role="status"]')!.parentElement!.getBoundingClientRect().height === idleFooterHeight,
    "Loading keeps the reconnect button and status area dimensions stable",
  );
  await finishRetryFeedback();
  assert(
    fixture.querySelector('[role="alert"]')?.textContent?.includes("重新连接失败") && !retryButton().disabled,
    "A fast retry publishes its result after the loading feedback completes",
  );
  const attemptsBeforeRetry = connectionAttempts;
  connectionGate = new Promise((resolve) => (releaseConnection = resolve));
  await act(async () => {
    const button = retryButton();
    button.click();
    button.click();
  });
  assert(
    fixture.textContent?.includes("正在重新连接") &&
      Array.from(fixture.querySelectorAll("button")).some(
        (button) => button.disabled && button.textContent === "连接中…",
      ),
    "Retry displays connecting status and disables its button",
  );
  assert(connectionAttempts === attemptsBeforeRetry + 1, "Consecutive retry clicks start one connection attempt");
  assert(
    fixture.textContent?.includes("Archived application message") && fixture.querySelector('[aria-label="复制消息"]'),
    "Connecting preserves readable history and copying",
  );
  await finishRetryFeedback();
  assert(
    fixture.querySelector<HTMLButtonElement>('button[aria-busy="true"]')?.disabled,
    "A slow connection remains loading after the minimum feedback duration",
  );
  await act(async () => {
    connectionGate = undefined;
    releaseConnection();
  });
  assert(
    fixture.querySelector('[role="alert"]')?.textContent?.includes("重新连接失败：应用已禁用或移除") &&
      !retryButton().disabled,
    "A repeated read-only result reports the failed attempt and permits another retry",
  );
  connectionGate = new Promise((resolve) => (releaseConnection = resolve));
  connectionFailure = "授权服务暂时不可用";
  await act(async () => retryButton().click());
  assert(!fixture.querySelector('[role="alert"]'), "A new retry clears the previous failure feedback");
  await act(async () => {
    connectionGate = undefined;
    connectionFailure = undefined;
    releaseConnection();
  });
  await finishRetryFeedback();
  assert(
    fixture.querySelector('[role="alert"]')?.textContent?.includes("授权服务暂时不可用") &&
      fixture.textContent?.includes("Archived application message") &&
      !retryButton().disabled,
    "Thrown connection errors retain history, report the failure and unlock retry",
  );
  // A newer availability notification can supersede a pending failed attempt.
  connectionGate = new Promise((resolve) => (releaseConnection = resolve));
  connectionFailure = "迟到的连接失败";
  await act(async () => retryButton().click());
  await act(async () => {
    connectionGate = undefined;
    connectionFailure = undefined;
    connected = true;
    historyListeners.forEach((listener) => listener(applicationSession));
  });
  await finishRetryFeedback();
  assert(
    historySession === applicationSession && sessionOpens === 0,
    "An already mounted history page reconnects to the application owner when it becomes available",
  );
  await act(async () => releaseConnection());
  assert(
    historySession === applicationSession &&
      !fixture.querySelector('[role="alert"]') &&
      !fixture.textContent?.includes("连接中"),
    "A late failed retry cannot overwrite a newer successful connection",
  );
  assert(historyListeners.size === 2, "StrictMode leaves one history observer and one host approval observer");
  await act(async () => {
    await historySession!.send({ text: "continue from history" });
    emit(applicationSession, { type: E.TextDelta, delta: "Application continuation" });
    emit(applicationSession, { type: E.Done, text: "Application continuation" });
  });
  assert(
    fixture.textContent?.includes("Application continuation"),
    "History renders continuation through the original application session",
  );
  await act(async () => {
    connected = false;
    recordChanges.forEach((listener) => listener());
  });
  assert(
    fixture.textContent?.includes("Application continuation") &&
      fixture.textContent?.includes("只读查看") &&
      !fixture.querySelector('[contenteditable="true"]'),
    "Disabling a application switches an already open history page to read-only while retaining messages",
  );
  await act(async () => {
    connected = true;
    (
      Array.from(fixture.querySelectorAll("button")).find(
        (button) => button.textContent === "重新连接",
      ) as HTMLButtonElement
    ).click();
  });
  await finishRetryFeedback();
  assert(
    historySession === applicationSession && fixture.querySelector('[contenteditable="true"]'),
    "Re-enabling the application can reconnect the original session from the read-only view",
  );
  await act(async () => {
    connected = false;
    canRetry = false;
    historyReason = "聊天缺少有效的来源信息";
    recordChanges.forEach((listener) => listener());
  });
  assert(
    fixture.textContent?.includes(historyReason) &&
      !retryButton() &&
      fixture.textContent?.includes("Application continuation"),
    "A record with missing origin remains readable without an ineffective reconnect button",
  );
  await act(async () => {
    root.unmount();
  });
  assert(
    historyListeners.size === 0 && recordChanges.size === 0 && applicationSession.getSnapshot().phase === "idle",
    "Leaving history detaches its observer without closing the application session",
  );
  await applicationSession.close();
  await checkApprovals();
  results.textContent = `PASS ${assertions.length} assertions\n${assertions.join("\n")}`;
  results.style.whiteSpace = "pre-wrap";
}
async function checkApprovals() {
  const session = await createChatSession({
    identity: { scope: "approval-test", id: "approval" },
    runtime,
    storage: { load: async () => null, save: async () => {} },
    catalog: { load: async () => ({ models, permissionOptions: structuredClone([...agentPermissionOptions]) }) },
  });
  const answers: [string, boolean][] = [];
  const service = {
    listSessions: () => [session],
    subscribe: (listener: (session: ChatSession) => void) => session.subscribe(() => listener(session)),
    viewPersistence: () => undefined,
    answerApproval: async (target: ChatSession, approvalId: string, approved: boolean) => {
      assert(target === session, "Approval actions retain the owning session");
      answers.push([approvalId, approved]);
      emit(session, { type: E.ApprovalResolved, approvalId, approved });
    },
  } as unknown as DesktopChatService;
  root = createRoot(fixture);
  const render = (visible: boolean) =>
    root.render(
      <StrictMode>
        <DesktopChatEnvironment service={service}>
          <div style={{ height: 680 }}>{visible ? <Chat session={session} /> : <p>Background task</p>}</div>
        </DesktopChatEnvironment>
      </StrictMode>,
    );
  const request = (id: string, expiresAt = Date.now() + 60_000) =>
    emit(session, {
      type: E.ApprovalRequested,
      approvalId: id,
      executionId: id,
      summary: "bash",
      reason: "需要执行命令，无法完整确认副作用。",
      details: JSON.stringify(
        { command: "pnpm test", operations: Array.from({ length: 20 }, (_, index) => `operation ${index}`) },
        null,
        2,
      ),
      expiresAt,
    });
  const button = (text: string) =>
    Array.from(fixture.querySelectorAll("button")).find((item) => item.textContent === text)!;
  await act(async () => {
    render(true);
    await session.send({ text: "test approval" });
    request("first");
  });
  assert(
    fixture.querySelectorAll('[aria-label="操作审批"]').length === 1 && !fixture.querySelector('[role="dialog"]'),
    "Approval appears once inline without a modal",
  );
  assert(!fixture.querySelector('[aria-label="后台会话审批"]'), "An inline approval suppresses its background card");
  const composerOffset = () =>
    fixture.querySelector("form")!.getBoundingClientRect().top - fixture.getBoundingClientRect().top;
  const composerTop = composerOffset();
  await act(async () => button("详情").click());
  const details = fixture.querySelector('[aria-label="完整审批信息"]')!;
  assert(
    details.getBoundingClientRect().bottom <= button("收起").getBoundingClientRect().top,
    "Approval details expand above the action row",
  );
  assert(Math.abs(composerOffset() - composerTop) < 2, "Expanding approval details preserves the composer position");
  assert(details.scrollHeight > details.clientHeight, "Long approval details scroll inside a bounded panel");
  await act(async () => button("批准一次").click());
  assert(
    answers[0]?.[0] === "first" && answers[0]?.[1] === true && !fixture.querySelector('[aria-label="操作审批"]'),
    "Approval submits once and disappears after resolution",
  );
  await act(async () => {
    request("second");
    render(false);
  });
  assert(
    fixture.querySelectorAll('[aria-label="操作审批"]').length === 1 &&
      fixture.querySelector('[aria-label="后台会话审批"]'),
    "Leaving the composer keeps a compact background approval available",
  );
  await act(async () => button("拒绝").click());
  assert(
    answers[1]?.[0] === "second" && answers[1]?.[1] === false,
    "Background approval can be rejected through the host",
  );
  await act(async () => {
    render(true);
    request("expired", Date.now() - 1);
  });
  assert(
    button("批准一次").disabled && !fixture.querySelector('[aria-label="完整审批信息"]'),
    "Expired approvals cannot be granted and new requests start collapsed",
  );
  await act(async () => {
    await session.stop();
    root.unmount();
  });
  await session.close();
}
run().catch((error) => {
  results.textContent = `FAIL ${String(error.stack || error)}\n${assertions.join("\n")}`;
  results.style.whiteSpace = "pre-wrap";
  console.error(error);
});
