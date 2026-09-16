import { useRef, useState, type ReactNode } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { Chat } from "@isle/app-sdk/chat/react";
import { tutorProfile } from "./generation";
import { gradeChoiceQuestions } from "./vendor/grading";
import type { Attempt, Course, Lesson } from "./course";

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function Icon({
  name,
  size = 20,
}: {
  name: "book" | "plus" | "arrow" | "spark" | "check" | "back";
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
    back: <path d="M20 12H5m6-6-6 6 6 6" />,
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="M21 2v4m-2-2h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
export function Quiz({
  lesson,
  attempt,
  onSubmit,
  disabled,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  onSubmit: (attempt: Attempt) => Promise<void>;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    attempt?.answers ?? {},
  );
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const results =
    attempt && !retrying
      ? gradeChoiceQuestions(lesson.questions, attempt.answers)
      : null;
  const complete = lesson.questions.every((q) => answers[q.id]);
  return (
    <section className="learn-quiz" aria-label="课后测验">
      <div className="learn-section-title">
        <div>
          <span className="learn-eyebrow">CHECK YOUR UNDERSTANDING</span>
          <h2>用一道题，检验理解</h2>
        </div>
        <span className="learn-chip">{lesson.questions.length} 道单选题</span>
      </div>
      {lesson.questions.map((q, index) => (
        <fieldset key={q.id} disabled={disabled || !!results}>
          <legend>
            {index + 1}. {q.question}
          </legend>
          <div className="learn-options">
            {q.options.map((option) => (
              <label
                key={option.value}
                className={`learn-option ${answers[q.id] === option.value ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name={q.id}
                  value={option.value}
                  checked={answers[q.id] === option.value}
                  onChange={() =>
                    setAnswers((current) => ({
                      ...current,
                      [q.id]: option.value,
                    }))
                  }
                />
                <span className="learn-option-letter">{option.value}</span>
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {results && (
            <div
              className={`learn-answer ${results[index].correct ? "correct" : "incorrect"}`}
            >
              <strong>
                {results[index].correct
                  ? "回答正确"
                  : `再理解一下 · 正确答案 ${q.answer}`}
              </strong>
              <p>{q.explanation}</p>
            </div>
          )}
        </fieldset>
      ))}
      {error && <Notice>{error}</Notice>}
      <div className="learn-actions">
        {results ? (
          <>
            <span className="learn-muted">
              答对 {results.filter((r) => r.correct).length} / {results.length}{" "}
              题 · 已保存
            </span>
            <button
              className="learn-button"
              disabled={disabled}
              onClick={() => {
                setRetrying(true);
                setAnswers({});
              }}
            >
              再练一次
            </button>
          </>
        ) : (
          <button
            className="learn-button primary"
            disabled={disabled || !complete}
            onClick={async () => {
              setError("");
              try {
                await onSubmit({ answers, submittedAt: Date.now() });
                setRetrying(false);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            {disabled ? "保存中…" : "提交答案"}
          </button>
        )}
      </div>
    </section>
  );
}
export function Tutor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connecting = useRef(false);
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
  return (
    <aside className="learn-tutor" aria-label="AI 学习导师">
      <header>
        <span className="learn-tutor-icon">
          <Icon name="spark" />
        </span>
        <div>
          <h2>学习导师</h2>
          <p>围绕这一课，继续探索</p>
        </div>
      </header>
      {error && <Notice>{error}</Notice>}
      {session ? (
        <div className="learn-chat">
          <Chat session={session} />
        </div>
      ) : (
        <div className="learn-tutor-empty">
          <div className="learn-orbit" aria-hidden="true">
            <Icon name="spark" size={36} />
          </div>
          <h3>每一个问题，都值得展开</h3>
          <p>
            导师会带着本课内容与你交流。你可以让它换一种说法、举一个例子，或出一道新题。
          </p>
          <div className="learn-prompt-hints">
            <span>「用一个生活中的例子解释」</span>
            <span>「我最容易误解的地方是什么？」</span>
          </div>
          <button
            className="learn-button"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? "连接中…" : error ? "重试连接" : "连接 AI 导师"}
            <Icon name="arrow" size={16} />
          </button>
          {error && (
            <button
              className="learn-button text"
              disabled={busy}
              onClick={() => void connect(true)}
            >
              新开导师对话（保留原历史）
            </button>
          )}
          <small>使用 Isle 中已配置的模型</small>
        </div>
      )}
    </aside>
  );
}
