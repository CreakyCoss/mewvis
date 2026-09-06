import type { ComponentProps, HTMLAttributes } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ChatProvider, useChatActions, useChatSnapshot, useChatViewState } from "./provider";
import { MessagesView, type ChatMessagesProps } from "./messages";
import { QuestionView } from "./question";
import { ChatComposer } from "./composer";
import type { ChatSession } from "../core";

function Messages(props: Pick<ChatMessagesProps, "className" | "renderMessage">) {
  const snapshot = useChatSnapshot();
  const view = useChatViewState();
  return (
    <MessagesView
      {...props}
      messages={snapshot.messages}
      isInitializing={snapshot.phase === "initializing"}
      pendingQuestionId={snapshot.pendingQuestion?.questionId}
      displayOptions={view.preferences}
    />
  );
}
function Question() {
  const snapshot = useChatSnapshot();
  const session = useChatActions();
  return snapshot.pendingQuestion ? (
    <QuestionView
      key={snapshot.pendingQuestion.questionId}
      answering={snapshot.answering}
      question={snapshot.pendingQuestion}
      onAnswer={async (answer) => {
        await session.answer({ questionId: snapshot.pendingQuestion!.questionId, answer });
      }}
    />
  ) : null;
}
function ErrorNotice() {
  const snapshot = useChatSnapshot();
  const actions = useChatActions();
  const view = useChatViewState();
  const resourceErrors = Object.values(snapshot.resources.errors ?? {});
  const errors = [
    snapshot.initializationError,
    snapshot.error,
    snapshot.saveError && `回复已保留，但保存失败：${snapshot.saveError}`,
    view.preferenceError && `展示偏好保存失败：${view.preferenceError}`,
    ...resourceErrors,
  ].filter(Boolean);
  if (!errors.length) return null;
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-[69rem] items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        {errors.map((error, index) => (
          <div key={index}>{error}</div>
        ))}
        {snapshot.initializationError ? (
          <button type="button" className="underline" onClick={() => void actions.retryInitialization()}>
            重新加载会话
          </button>
        ) : null}
        {snapshot.saveError ? (
          <button type="button" className="underline" onClick={() => void actions.retrySave()}>
            重试保存
          </button>
        ) : null}
        {view.preferenceError ? (
          <button type="button" className="underline" onClick={() => void view.retryPreferences()}>
            重试偏好保存
          </button>
        ) : null}
        {resourceErrors.length ? (
          <button type="button" className="underline" onClick={() => void actions.refreshResources()}>
            重新加载资源
          </button>
        ) : null}
      </div>
    </div>
  );
}
function Loading({ error }: { error?: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
      {error ? null : <Spinner />}
      <span>{error || "正在加载对话"}</span>
    </div>
  );
}
function Layout({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <main {...props} className={`flex h-full min-h-0 bg-background text-foreground ${className}`}>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </main>
  );
}
function Footer({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`shrink-0 space-y-3 bg-background/95 px-4 py-4 backdrop-blur sm:px-8 ${className}`}>
      {children}
    </div>
  );
}
function History({
  messages,
  displayOptions = { showThinkingProcess: true, showToolCallProcess: true },
  reason,
  onRetry,
  connecting = false,
  retryError,
  className,
  renderMessage,
}: Pick<ChatMessagesProps, "messages" | "renderMessage" | "className"> & {
  displayOptions?: ChatMessagesProps["displayOptions"];
  reason: string;
  onRetry?: () => void;
  connecting?: boolean;
  retryError?: string;
}) {
  return (
    <Layout className={className}>
      {messages.length ? (
        <MessagesView
          messages={messages}
          displayOptions={displayOptions}
          renderMessage={renderMessage}
          isInitializing={false}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">暂无聊天消息</div>
      )}
      <Footer>
        <div className="mx-auto flex max-w-[69rem] items-center justify-between gap-4 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <div className="min-w-0 space-y-1">
            <p>只读查看 · 无法继续聊天。</p>
            <p
              role={retryError && !connecting ? "alert" : "status"}
              className={`min-h-5 ${retryError && !connecting ? "text-destructive" : ""}`}
            >
              {connecting ? "正在重新连接…" : retryError ? `重新连接失败：${retryError}` : reason}
            </p>
          </div>
          {onRetry ? (
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 disabled:cursor-wait"
              disabled={connecting}
              aria-busy={connecting}
              onClick={onRetry}
            >
              <span aria-hidden="true" className="flex size-3.5 items-center justify-center">
                {connecting ? <Spinner className="size-3.5" /> : null}
              </span>
              <span className="w-[4em] text-center underline">{connecting ? "连接中…" : "重新连接"}</span>
            </button>
          ) : null}
        </div>
      </Footer>
    </Layout>
  );
}
function DefaultChat({
  session,
  viewId,
  className,
  renderMessage,
  composer,
}: {
  session: ChatSession;
  viewId?: string;
  className?: string;
  renderMessage?: ChatMessagesProps["renderMessage"];
  composer?: ComponentProps<typeof ChatComposer>;
}) {
  return (
    <ChatProvider session={session} viewId={viewId}>
      <Layout className={className}>
        <Messages renderMessage={renderMessage} />
        <Footer>
          <ErrorNotice />
          <Question />
          <ChatComposer {...composer} />
        </Footer>
      </Layout>
    </ChatProvider>
  );
}
export const Chat = Object.assign(DefaultChat, {
  Provider: ChatProvider,
  Layout,
  Footer,
  Messages,
  Composer: ChatComposer,
  Question,
  Error: ErrorNotice,
  Loading,
  History,
});
