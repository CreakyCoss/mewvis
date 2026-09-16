import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Chat } from "@isle/app-sdk/chat/react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import {
  buildPrompt,
  courseFromSnapshot,
  generationProfile,
} from "./generation";
import {
  createCourse,
  type Brief,
  type Course,
  type CourseContent,
} from "./course";
import { errorText, Icon, Notice } from "./components";

const draftKey = "learning:draft:v1";
const defaultBrief: Brief = {
  topic: "",
  level: "零基础",
  count: 3,
  material: "",
};
type Draft = { brief: Brief; workspaceId: string; chatId: string };

function Generation({
  session,
  brief,
  onSave,
}: {
  session: ApplicationChatSession;
  brief: Brief;
  onSave: (course: Course) => Promise<void>;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingCourse = useRef<{ signature: string; course: Course } | null>(
    null,
  );
  let content: CourseContent | null = null;
  let validationError = "";
  try {
    content = courseFromSnapshot(snapshot);
  } catch (e) {
    validationError = errorText(e);
  }
  const idle = snapshot.phase === "idle";
  const send = async () => {
    setBusy(true);
    setError("");
    pendingCourse.current = null;
    try {
      const result = await session.send({
        text: buildPrompt(brief),
        requestId: crypto.randomUUID(),
      });
      if (result.status !== "dispatched")
        throw new Error(result.reason || "生成未启动，请检查模型与权限设置");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="learn-generation">
      <div className="learn-generation-summary">
        <div className="learn-section-title">
          <div>
            <span className="learn-eyebrow">COURSE STUDIO</span>
            <h2>{brief.topic}</h2>
          </div>
          <span className="learn-chip">
            {brief.count} 课时 · {brief.level}
          </span>
        </div>
        <p className="learn-muted">
          先在聊天区选择模型，再生成课程。也可以继续对话调整内容，生成完成后加入课程库。
        </p>
        {error && <Notice>{error}</Notice>}
        {validationError && (
          <Notice>
            {validationError} 可在下方对话中要求重新输出完整 JSON。
          </Notice>
        )}
        {!content && (
          <button
            className="learn-button primary"
            disabled={busy || !idle || !snapshot.config.selectedModelId}
            onClick={() => void send()}
          >
            <Icon name="spark" />
            {!idle
              ? "正在生成，可在聊天区停止…"
              : busy
                ? "提交中…"
                : snapshot.messages.length
                  ? "按原需求重新生成"
                  : "生成完整课程"}
          </button>
        )}
        {content && (
          <div className="learn-generated">
            <span className="learn-chip success">
              <Icon name="check" size={14} />
              课程已生成
            </span>
            <h3>{content.title}</h3>
            <p>{content.description}</p>
            <ol>
              {content.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <strong>{lesson.title}</strong>
                  <span>{lesson.objective}</span>
                </li>
              ))}
            </ol>
            {content.lessons.length !== brief.count && (
              <p className="learn-muted">
                模型返回了 {content.lessons.length} 课时（原计划 {brief.count}
                ）。可继续对话调整，或保存当前课程。
              </p>
            )}
            <button
              className="learn-button primary"
              disabled={busy || !idle}
              onClick={async () => {
                if (!content) return;
                setBusy(true);
                setError("");
                try {
                  // Keep identity stable if a storage response is lost and the user retries.
                  const signature = JSON.stringify(content);
                  if (pendingCourse.current?.signature !== signature)
                    pendingCourse.current = {
                      signature,
                      course: createCourse(content),
                    };
                  await onSave(pendingCourse.current.course);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "保存中…" : "加入课程库，开始学习"}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="learn-author-chat">
        <Chat session={session} />
      </div>
    </div>
  );
}

export function Studio({
  onSave,
}: {
  onSave: (course: Course) => Promise<void>;
}) {
  const [brief, setBrief] = useState<Brief>(defaultBrief);
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved =
          await getApplicationDataClient().storage.getItem<Draft>(draftKey);
        if (!saved || !alive) return;
        buildPrompt(saved.brief);
        setBrief(saved.brief);
        setDraft(saved);
        const reopened = await getApplicationChatClient().openSession({
          workspaceId: saved.workspaceId,
          chatId: saved.chatId,
        });
        if (alive) setSession(reopened);
      } catch (e) {
        if (alive)
          setError(
            `恢复生成记录失败：${errorText(e)}。需求仍保留，可以重新连接创建。`,
          );
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      buildPrompt(brief);
      const workspaces = await getApplicationDataClient().workspaces.list();
      const workspace = workspaces.find((w) => w.isDefault) ?? workspaces[0];
      if (!workspace) throw new Error("没有可用的学习工作区");
      const created = await getApplicationChatClient().createSession({
        workspaceId: workspace.id,
        sceneId: "learning-generation",
        profile: generationProfile,
      });
      const nextDraft = {
        brief,
        workspaceId: workspace.id,
        chatId: created.identity.id,
      };
      try {
        await getApplicationDataClient().storage.setItem(draftKey, nextDraft);
      } catch (e) {
        await created.close();
        throw e;
      }
      setDraft(nextDraft);
      setSession(created);
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="learn-studio">
      <div className="learn-page-heading">
        <div>
          <span className="learn-eyebrow">A LITTLE CURIOSITY, EVERY DAY</span>
          <h1>从好奇，开始一门课</h1>
          <p>给学习一个主题，把想了解的知识变成循序渐进的课程。</p>
        </div>
        <span className="learn-chip">AI 课程工坊</span>
      </div>
      {error && <Notice>{error}</Notice>}
      {session ? (
        <>
          <Generation
            session={session}
            brief={draft?.brief ?? brief}
            onSave={onSave}
          />
          <p className="learn-muted learn-studio-note">
            生成对话可从 Isle 历史继续查看。AI
            内容可能有误，学习时请结合可靠资料核对。
          </p>
          <button
            className="learn-button text"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await session.close();
                if (!result.ok) throw new Error(result.error);
                await clearGenerationDraft();
                setSession(null);
                setDraft(null);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            结束此生成，重新填写需求
          </button>
        </>
      ) : (
        <div className="learn-brief-layout">
          <div className="learn-brief">
            <label htmlFor="learning-topic">
              你想学什么？<span>必填</span>
            </label>
            <input
              id="learning-topic"
              value={brief.topic}
              maxLength={200}
              placeholder="例如：从零理解机器学习，或写出更清晰的文章"
              onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
            />
            <div className="learn-topic-chips">
              {[
                "从零理解机器学习",
                "摄影中的光线与构图",
                "写出清晰的技术文档",
              ].map((topic) => (
                <button
                  key={topic}
                  onClick={() => setBrief({ ...brief, topic })}
                >
                  {topic}
                </button>
              ))}
            </div>
            <div className="learn-fields">
              <div>
                <label htmlFor="learning-level">当前水平</label>
                <select
                  id="learning-level"
                  value={brief.level}
                  onChange={(e) =>
                    setBrief({ ...brief, level: e.target.value })
                  }
                >
                  <option>零基础</option>
                  <option>了解一些</option>
                  <option>希望进阶</option>
                </select>
              </div>
              <div>
                <label htmlFor="learning-count">课程长度</label>
                <select
                  id="learning-count"
                  value={brief.count}
                  onChange={(e) =>
                    setBrief({ ...brief, count: Number(e.target.value) })
                  }
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} 个课时
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label htmlFor="learning-material">
              参考资料<span>选填 · 最多 20,000 字</span>
            </label>
            <textarea
              id="learning-material"
              rows={7}
              maxLength={20000}
              value={brief.material}
              placeholder="粘贴笔记、文章或资料摘录，让课程围绕你的内容展开。"
              onChange={(e) => setBrief({ ...brief, material: e.target.value })}
            />
            <div className="learn-file-row">
              <label className="learn-file-button">
                导入 TXT / Markdown
                <input
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      if (
                        !/\.(txt|md|markdown)$/i.test(file.name) ||
                        file.size > 80_000
                      )
                        throw new Error(
                          "请选择不超过 80 KB 的 TXT 或 Markdown 文件",
                        );
                      const material = await file.text();
                      if (
                        material.length > 20_000 ||
                        material.includes("\u0000")
                      )
                        throw new Error(
                          "请使用不超过 20,000 字的 UTF-8 文本资料",
                        );
                      setBrief((current) => ({ ...current, material }));
                      setFileName(file.name);
                      setError("");
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                />
              </label>
              <small>
                {fileName ||
                  `${brief.material.length.toLocaleString()} / 20,000 字`}
              </small>
            </div>
            <p className="learn-muted">
              生成时，主题与参考资料会发送给你选择的模型。
            </p>
            <button
              className="learn-button primary"
              disabled={busy || !brief.topic.trim()}
              onClick={() => void start()}
            >
              {busy ? "准备中…" : "下一步：选择模型并生成"}
              <Icon name="arrow" size={18} />
            </button>
          </div>
          <aside className="learn-plan">
            <span className="learn-eyebrow">YOUR LEARNING PATH</span>
            <h2>让知识，有路可循。</h2>
            <p>从理解到练习，每一步都离掌握更近一些。</p>
            <ol>
              {[
                ["01", "建立理解", "一个清晰目标，一段循序渐进的讲解。"],
                ["02", "看见应用", "用具体例子，把抽象知识连接到生活。"],
                ["03", "检验掌握", "完成测验，获得答案解析与学习反馈。"],
              ].map(([n, title, description]) => (
                <li key={n}>
                  <span>{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="learn-plan-foot">
              <Icon name="book" />
              <span>课程与进度保存在当前应用中</span>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export async function clearGenerationDraft() {
  await getApplicationDataClient().storage.removeItem(draftKey);
}
