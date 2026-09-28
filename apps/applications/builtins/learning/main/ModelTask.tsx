import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Chat } from "@isle/app-sdk/chat/react";
import {
  getApplicationChatClient,
  type ApplicationChatProfile,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { finalText } from "./generation";
import type { SessionRef } from "./workflow";
import { Notice, errorText } from "./components";
import { recoverMissingChat } from "./chatRecovery";

const sessions = new Map<string, ApplicationChatSession>();
export async function createModelTask(
  profile: ApplicationChatProfile,
): Promise<SessionRef> {
  const workspaces = await getApplicationDataClient().workspaces.list();
  const workspace = workspaces.find((w) => w.isDefault) ?? workspaces[0];
  if (!workspace) throw new Error("没有可用的学习工作区");
  const session = await getApplicationChatClient().createSession({
    workspaceId: workspace.id,
    sceneId: profile.id,
    profile,
  });
  sessions.set(session.identity.id, session);
  return { workspaceId: workspace.id, chatId: session.identity.id };
}
export async function openModelTask(ref: SessionRef) {
  let session = sessions.get(ref.chatId);
  if (session?.getSnapshot().phase === "closed") {
    sessions.delete(ref.chatId);
    session = undefined;
  }
  if (!session) {
    session = await getApplicationChatClient().openSession(ref);
    sessions.set(ref.chatId, session);
  }
  return session;
}
export async function closeModelTask(ref: SessionRef) {
  const session = await recoverMissingChat<ApplicationChatSession | null>(
    () => openModelTask(ref),
    async () => null,
  );
  if (!session) return;
  const result = await session.close();
  if (!result.ok) throw new Error(result.error);
  sessions.delete(ref.chatId);
}
type Props = {
  taskRef: SessionRef;
  prompt: string;
  title: string;
  preview: (raw: string) => ReactNode;
  onAccept: (raw: string) => Promise<void>;
  onRetryConnection: () => Promise<void>;
  acceptLabel?: string;
  embedded?: boolean;
  renderChat?: (session: ApplicationChatSession) => ReactNode;
};
export function ModelTask(props: Props) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setSession(null);
    setError("");
    void recoverMissingChat<ApplicationChatSession | null>(
      () => openModelTask(props.taskRef),
      async () => {
        if (alive) await props.onRetryConnection();
        return null;
      },
    )
      .then((value) => {
        if (alive) setSession(value);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [props.taskRef.chatId, props.taskRef.workspaceId]);
  if (error)
    return (
      <Notice>
        恢复任务会话失败：{error}。已保存内容仍保留。
        <button
          className="learn-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await props.onRetryConnection();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          新建会话重试
        </button>
      </Notice>
    );
  return session ? (
    <ConnectedTask key={session.identity.id} {...props} session={session} />
  ) : (
    <p role="status">正在连接生成会话…</p>
  );
}
function ConnectedTask({
  session,
  ...props
}: Props & { session: ApplicationChatSession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const raw = finalText(snapshot);
  let preview: ReactNode = null;
  let validation = "";
  if (raw !== null) {
    try {
      preview = props.preview(raw);
    } catch (e) {
      validation = errorText(e);
    }
  }
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="learn-task" aria-label={props.title}>
      {!props.embedded && (
        <div className="learn-section-title">
          <h2>{props.title}</h2>
          <span className="learn-chip">
            {snapshot.phase === "idle" ? "等待操作" : "生成中"}
          </span>
        </div>
      )}
      {!props.embedded && (
        <p className="learn-muted">
          在聊天区选择模型后开始。可停止或继续对话修正，结果校验通过后再采用。
        </p>
      )}
      {error && <Notice>{error}</Notice>}
      {validation && (
        <Notice>{validation}。已保存内容不受影响，可重试生成。</Notice>
      )}
      <div className="learn-actions">
        <button
          className="learn-button"
          disabled={
            busy ||
            snapshot.phase !== "idle" ||
            !snapshot.config.selectedModelId
          }
          onClick={() =>
            void run(async () => {
              const result = await session.send({
                text: props.prompt,
                requestId: crypto.randomUUID(),
              });
              if (result.status !== "dispatched")
                throw new Error(result.reason || "任务未启动");
            })
          }
        >
          {snapshot.messages.length
            ? "重新生成 / 重试"
            : props.embedded
              ? "开始评阅"
              : "开始生成"}
        </button>
        {raw !== null && !validation && (
          <button
            className="learn-button primary"
            disabled={busy}
            onClick={() => void run(() => props.onAccept(raw))}
          >
            {props.acceptLabel ?? "采用并保存结果"}
          </button>
        )}
      </div>
      {preview && <div className="learn-result-preview">{preview}</div>}
      <div className="learn-author-chat" inert={busy}>
        {props.renderChat ? (
          props.renderChat(session)
        ) : (
          <Chat session={session} />
        )}
      </div>
    </section>
  );
}
