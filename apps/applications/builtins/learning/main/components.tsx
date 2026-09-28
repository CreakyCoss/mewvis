import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { Chat } from "@isle/app-sdk/chat/react";
import { tutorProfile } from "./generation";
import type { Course, Lesson } from "./course";

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function Icon({
  name,
  size = 20,
}: {
  name: "book" | "plus" | "arrow" | "send" | "spark" | "check" | "back" | "chevronUp" | "chevronDown" | "trash";
  size?: number;
}) {
  const paths = {
    book: (
      <>
        <path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
        <path d="M12 5v15" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    back: <path d="M20 12H5m6-6-6 6 6 6" />,
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="M21 2v4m-2-2h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" />
        <path d="M10 10v6m4-6v6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "send" ? 2 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="learn-notice" role="alert">
      {children}
    </div>
  );
}
export function Text({ value }: { value: string }) {
  return (
    <div className="learn-prose">
      {value.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
export { Quiz } from "./Quiz";
export type FocusTarget =
  "objective" | "example" | "takeaways" | "recall" | "quiz";
export function Tutor({
  course,
  lesson,
  onFocus,
  expanded,
  onToggleExpand,
}: {
  course: Course;
  lesson: Lesson;
  onFocus: (target: FocusTarget) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState<FocusTarget | null>(null);
  const connecting = useRef(false);
  const requestHint = async () => {
    if (!session || connecting.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await session.send({
        text: "请根据本课目标给我一个分步学习提示：先提出一个让我自己思考的问题，再提示我应查看目标、例子、要点自测还是测验。不要直接给出测验答案。",
        requestId: crypto.randomUUID(),
      });
      if (result.status !== "dispatched")
        throw new Error(
          result.reason || "导师提示未发送，请先在聊天区选择模型",
        );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = async (fresh = false) => {
    if (connecting.current) return;
    connecting.current = true;
    setBusy(true);
    setError("");
    try {
      const data = getApplicationDataClient();
      const workspaces = await data.workspaces.list();
      const workspace = workspaces.find((w) => w.isDefault) ?? workspaces[0];
      if (!workspace)
        throw new Error("尚无学习工作区，请在 Isle 中重新打开应用");
      const key = `learning:tutor:${course.id}:${lesson.id}`;
      const previous = await data.storage.getItem<{
        workspaceId: string;
        chatId: string;
      }>(key);
      const client = getApplicationChatClient();
      if (previous && !fresh) {
        // Do not silently replace an existing conversation when opening fails.
        setSession(await client.openSession(previous));
      } else {
        const created = await client.createSession({
          workspaceId: workspace.id,
          sceneId: "learning-tutor",
          profile: {
            ...tutorProfile,
            context: {
              requestContext: JSON.stringify({ course: course.title, lesson }),
            },
          },
        });
        try {
          await data.storage.setItem(key, {
            workspaceId: workspace.id,
            chatId: created.identity.id,
          });
        } catch (e) {
          await created.close();
          throw e;
        }
        setSession(created);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      connecting.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    void connect();
  }, []);
  return (
    <aside className="learn-tutor" aria-label="AI 学习导师">
      <header>
        <span className="learn-tutor-icon">
          <Icon name="spark" />
        </span>
        <div>
          <h2>学习导师</h2>
          <p>{lesson.title}</p>
        </div>
        <span
          className={`learn-tutor-status ${session ? "ready" : error ? "error" : ""}`}
          role="status"
        >
          {session ? "可随时提问" : error ? "连接失败" : "连接中"}
        </span>
        <button
          className="learn-tutor-expand"
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          {expanded ? "返回课程" : "展开对话"}
        </button>
      </header>
      <details className="learn-tutor-guide">
        <summary>
          学习引导 <span aria-hidden="true">⌄</span>
        </summary>
        <div className="learn-tutor-guide-body">
          <p>快速定位内容，先独立思考，再向导师提问。</p>
          <div className="learn-tutor-guide-actions">
            {(
              [
                ["objective", "看目标"],
                ["example", "看例子"],
                ["recall", "回忆要点"],
                ["quiz", "去测验"],
              ] as const
            ).map(([target, label]) => (
              <button
                key={target}
                className="learn-button text"
                onClick={() => {
                  setHint(target);
                  onFocus(target);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {session && (
            <button
              className="learn-button"
              disabled={busy}
              onClick={() => void requestHint()}
            >
              请 AI 导师给下一步提示
            </button>
          )}
          {hint && (
            <p className="learn-tutor-hint" role="status">
              {hint === "objective"
                ? `先用自己的话解释目标：${lesson.objective}`
                : hint === "example"
                  ? "读完例子后，试着说出它说明了正文中的哪一个概念。"
                  : hint === "recall"
                    ? "先遮住要点回忆，再翻开卡片核对遗漏。"
                    : "先独立作答；提交后根据解析定位需要巩固的内容。"}
            </p>
          )}
        </div>
      </details>
      {error && <Notice>{error}</Notice>}
      {session ? (
        <div className="learn-chat">
          <Chat session={session} />
        </div>
      ) : (
        <div className="learn-tutor-empty">
          {busy ? (
            <p role="status">正在准备导师对话…</p>
          ) : error ? (
            <>
              <p>导师连接失败，已有对话记录仍保留。</p>
              <button className="learn-button" onClick={() => void connect()}>
                重试连接
              </button>
              <button
                className="learn-button text"
                onClick={() => void connect(true)}
              >
                新开导师对话（保留原历史）
              </button>
            </>
          ) : (
            <p role="status">正在准备导师对话…</p>
          )}
        </div>
      )}
    </aside>
  );
}
