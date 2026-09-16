import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApplicationChatClient, type ApplicationChatSession } from "@isle/app-sdk/chat";
import type { ApplicationWorkspace } from "@isle/app-sdk/data";
import type { StoryDocumentIdentity } from "../../shared/project/types";
import generalBackground from "./assets/general-lounge.jpg";
import tavernBackground from "./assets/rainy-tavern.jpg";
import wuxiaBackground from "./assets/wuxia-courtyard.jpg";
import { TavernAgentFlow } from "./room/agent-flow";
import type { TavernAgentFlowEvent, TavernAgentFlowRunAgent, TavernAgentFlowRunAgentInput } from "./room/agent-flow/types";
import type { TavernStoryData } from "./room/model";
import {
  createTavernAgentOutputFieldMessageBody,
  createTavernTextMessageBody,
  type TavernMessage,
} from "./room/model/message";
import { createRenderableMessages } from "./room/message/normalization";
import type { MessageRenderInput, MessageSegment, RenderableMessage } from "./room/message/types";
import { getTavernPresentationProfile } from "./presets/prompts/presentation-rules";
import { createTimestampId, getCurrentTimestamp } from "./utils";

export type TavernChapterSummary = { ref: StoryDocumentIdentity; displayName: string };
export type TavernToolCall = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

type Props = {
  workspace: ApplicationWorkspace;
  chapter: TavernChapterSummary;
  story: TavernStoryData;
  execute: TavernToolCall;
  close(): void;
};

type ExecutionStep = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "error";
};

const backgrounds = {
  general: generalBackground,
  modern: generalBackground,
  scifi: generalBackground,
  wuxia: wuxiaBackground,
  fantasy: wuxiaBackground,
  tavern: tavernBackground,
  mystery: tavernBackground,
  oracle: tavernBackground,
} as const;

const overlays = {
  general: "linear-gradient(180deg,rgba(248,250,252,.92),rgba(248,250,252,.76) 38%,rgba(248,250,252,.92)),radial-gradient(circle at 50% 34%,rgba(255,255,255,.72),transparent 46%)",
  modern: "linear-gradient(180deg,rgba(248,250,252,.92),rgba(239,246,250,.74) 40%,rgba(248,250,252,.92))",
  wuxia: "linear-gradient(180deg,rgba(247,250,247,.82),rgba(242,247,239,.70) 42%,rgba(247,250,247,.88)),radial-gradient(circle at 50% 34%,rgba(255,252,238,.64),transparent 48%)",
  tavern: "linear-gradient(180deg,rgba(8,13,12,.80),rgba(16,22,20,.76) 42%,rgba(10,13,12,.94)),radial-gradient(circle at 50% 34%,rgba(16,22,20,.54),transparent 58%)",
  mystery: "linear-gradient(180deg,rgba(9,12,17,.84),rgba(17,24,39,.76) 42%,rgba(8,10,14,.94))",
  scifi: "linear-gradient(180deg,rgba(2,6,23,.88),rgba(8,24,39,.78) 42%,rgba(2,6,23,.94)),linear-gradient(110deg,rgba(34,211,238,.16),transparent 44%,rgba(245,158,11,.08))",
  fantasy: "linear-gradient(180deg,rgba(16,24,19,.76),rgba(26,39,29,.64) 42%,rgba(12,18,14,.88))",
  oracle: "linear-gradient(180deg,rgba(20,17,15,.82),rgba(35,25,22,.70) 42%,rgba(12,10,9,.92)),linear-gradient(100deg,rgba(180,83,9,.14),transparent 50%,rgba(13,148,136,.10))",
} as const;

const assistantText = (session: ApplicationChatSession, start: number) => session.getSnapshot().messages
  .slice(start)
  .filter(message => message.role === "assistant")
  .flatMap(message => message.blocks)
  .filter(block => block.type === "text")
  .map(block => block.content)
  .join("\n")
  .trim();

const waitForAgent = async (
  session: ApplicationChatSession,
  input: TavernAgentFlowRunAgentInput,
  start: number,
) => new Promise<{ text: string; taskId: string }>((resolve, reject) => {
  let previous = "";
  let settled = false;
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    detach();
    callback();
  };
  const inspect = () => {
    const snapshot = session.getSnapshot();
    const text = assistantText(session, start);
    if (text && text !== previous) {
      input.onTextDelta?.(text.startsWith(previous) ? text.slice(previous.length) : text);
      previous = text;
    }
    if (snapshot.error) return finish(() => reject(new Error(snapshot.error)));
    if (snapshot.pendingQuestion) return finish(() => reject(new Error("酒馆 Agent 请求了额外用户输入。")));
    if (snapshot.phase === "idle" && snapshot.messages.length > start) {
      if (!text) return finish(() => reject(new Error("酒馆 Agent 没有返回可解析文本。")));
      finish(() => resolve({ text, taskId: snapshot.activeTaskId || crypto.randomUUID() }));
    }
  };
  const detach = session.subscribe(inspect);
  const timeout = window.setTimeout(() => finish(() => reject(new Error("酒馆 Agent 响应超时。"))), 5 * 60_000);
  inspect();
});

const createApplicationAgentRunner = (workspace: ApplicationWorkspace, epoch: number) => {
  const client = getApplicationChatClient();
  const sessions = new Map<string, Promise<ApplicationChatSession>>();
  const sessionFor = (input: TavernAgentFlowRunAgentInput) => {
    const current = sessions.get(input.agentRoleId);
    if (current) return current;
    const created = client.createSession({
      workspaceId: workspace.id,
      sceneId: `tavern-agent:${epoch}:${input.agentRoleId}`,
      profile: {
        id: input.agentRoleId,
        systemPrompt: input.systemPrompt?.trim() || "你正在执行章节酒馆角色演绎任务。",
        context: {
          requestContext: input.requestContext || undefined,
          runtimeInstruction: input.runtimeInstruction || undefined,
        },
        allowedToolNames: [],
        useKnowledge: false,
      },
    });
    sessions.set(input.agentRoleId, created);
    return created;
  };
  const run: TavernAgentFlowRunAgent = async input => {
    const session = await sessionFor(input);
    const start = session.getSnapshot().messages.length;
    const sent = await session.send({ text: input.userMessage });
    if (sent.status !== "dispatched") throw new Error(sent.reason || "酒馆 Agent 未能启动。");
    const result = await waitForAgent(session, input, start);
    return { ...result, agentSession: { id: session.identity.id } };
  };
  return {
    run,
    async reset() {
      const opened = await Promise.allSettled(sessions.values());
      await Promise.all(opened.flatMap(result => result.status === "fulfilled" ? [result.value.close()] : []));
      sessions.clear();
    },
  };
};

const renderSegment = (segment: MessageSegment, index: number) => {
  if (segment.type === "thought") return <details className="story-tavern-thought" key={index}>
    <summary>角色内心</summary><p>{segment.text}</p></details>;
  if (segment.type === "action") return <p className="story-tavern-action" key={index}>*{segment.text}*</p>;
  return <p className={segment.type === "narration" ? "story-tavern-narration" : ""} key={index}>{segment.text}</p>;
};

const MessageView = ({ message, prose }: { message: RenderableMessage; prose: boolean }) => {
  if (prose) return <article className={`story-tavern-prose-message ${message.role}`}>
    {message.role === "character" && <strong>{message.speakerName}</strong>}
    {message.segments.map(renderSegment)}
  </article>;
  if (message.role === "narrator") return <article className="story-tavern-narrator">
    {message.segments.map(renderSegment)}
  </article>;
  return <article className={`story-tavern-message ${message.role}`}>
    {message.role === "character" && <div className="story-character-avatar">{message.speakerName.slice(0, 1)}</div>}
    <div><strong>{message.speakerName}</strong><section>{message.segments.map(renderSegment)}</section></div>
  </article>;
};

export function OriginalTavernRoom({ workspace, chapter, story, execute, close }: Props) {
  const [messages, setMessages] = useState<TavernMessage[]>([]);
  const messagesRef = useRef<TavernMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [sideOpen, setSideOpen] = useState(true);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const [epoch, setEpoch] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const agentRunner = useMemo(() => createApplicationAgentRunner(workspace, epoch), [workspace.id, epoch]);
  const chapterId = story.chapterId;
  const presentation = getTavernPresentationProfile(story.roomConfig.presentation.profileId);
  const prose = presentation.renderStyle === "prose";

  useEffect(() => () => { void agentRunner.reset(); }, [agentRunner]);

  const commitMessages = useCallback(async (next: TavernMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    await execute("isle_story_tavern_room_save", { workspaceId: workspace.id, chapterId, messages: next });
  }, [chapterId, execute, workspace.id]);

  useEffect(() => {
    let alive = true;
    setLoaded(false); setError("");
    void execute<{ messages: TavernMessage[] }>("isle_story_tavern_room_read", { workspaceId: workspace.id, chapterId })
      .then(result => {
        if (!alive) return;
        const stored = Array.isArray(result.messages) ? result.messages : [];
        messagesRef.current = stored; setMessages(stored); setLoaded(true);
      })
      .catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; autoRef.current = false; };
  }, [chapterId, execute, workspace.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy, loaded]);

  const updateStep = (id: string, patch: Partial<ExecutionStep>) => setSteps(current =>
    current.map(step => step.id === id ? { ...step, ...patch } : step));
  const onFlowEvent = (event: TavernAgentFlowEvent) => {
    if (event.type === "director_start") {
      setBusy("导演正在调度角色…"); setSteps([{ id: "director", label: "导演调度", status: "running" }]);
    } else if (event.type === "director_done") {
      setSteps([{ id: "director", label: "导演调度", detail: event.decision.reason, status: "done" },
        ...event.decision.speakerIds.map(id => ({ id: `speaker-${id}`, label: `${story.characters.find(item => item.id === id)?.name || id}回应`, status: "pending" as const }))]);
    } else if (event.type === "director_narrator") setBusy("导演正在铺写旁白…");
    else if (event.type === "speaker_start") {
      setBusy(`${event.character.name}正在回应…`); updateStep(`speaker-${event.character.id}`, { status: "running" });
    } else if (event.type === "speaker_done") updateStep(`speaker-${event.character.id}`, { status: "done" });
  };

  const submit = useCallback(async (text: string, sceneDrive = false) => {
    const content = text.trim();
    if (busy || (!content && !sceneDrive)) return false;
    if (!story.characters.length) { setError("当前房间还没有可回应的角色。"); return false; }
    const turnId = createTimestampId("turn");
    const existing = messagesRef.current;
    const userMessage: TavernMessage | null = sceneDrive ? null : {
      id: createTimestampId("msg"), roomId: story.roomConfig.id, turnId,
      kind: "user_text", role: "user", body: createTavernTextMessageBody(content),
      createdAt: getCurrentTimestamp(), status: "done",
    };
    setError(""); setBusy(sceneDrive ? "导演正在自推动场景…" : "导演正在调度角色…");
    try {
      if (userMessage) await commitMessages([...existing, userMessage]);
      const result = await TavernAgentFlow.run({
        workspacePath: workspace.id,
        runtimeModel: {},
        story,
        messages: existing,
        currentUserText: content,
        trigger: sceneDrive ? { type: "scene_drive", directive: content } : { type: "user" },
        turnId,
        maxSpeakers: story.roomConfig.settings.directorMaxSpeakers,
        runAgent: agentRunner.run,
        onEvent: onFlowEvent,
      });
      await commitMessages([...messagesRef.current, ...result.messages]);
      setBusy("");
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`酒馆回应失败：${message}`); setBusy("");
      setSteps(current => current.map(step => step.status === "running" ? { ...step, status: "error" } : step));
      return false;
    }
  }, [agentRunner.run, busy, commitMessages, story, workspace.id]);

  const runAuto = useCallback(async () => {
    let count = 0;
    while (autoRef.current && count < 20) {
      count += 1;
      const ok = await submit(draft, true);
      if (!ok || !autoRef.current) break;
      await new Promise(resolve => window.setTimeout(resolve, 900));
    }
    autoRef.current = false; setAuto(false);
  }, [draft, submit]);

  const reset = async () => {
    if (!window.confirm(`清空章节「${story.context.target?.label || chapterId}」的酒馆运行数据？下次会按最新故事数据重新初始化。`)) return;
    autoRef.current = false; setAuto(false); setBusy("正在重置酒馆…");
    try {
      await agentRunner.reset();
      await execute("isle_story_tavern_room_reset", { workspaceId: workspace.id, chapterId });
      messagesRef.current = []; setMessages([]); setSteps([]); setEpoch(value => value + 1); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  };

  const opening: MessageRenderInput = useMemo(() => ({
    id: `tavern-opening:${chapterId}:${story.roomConfig.id}`,
    role: "narrator",
    body: createTavernAgentOutputFieldMessageBody({ field: "narrative", text: `已进入「${story.context.target?.label || chapterId}」的酒馆演绎。` }),
    createdAt: getCurrentTimestamp(), status: "done",
    presentation: { profileId: presentation.id, userInputMode: presentation.userInputMode },
  }), [chapterId, presentation.id, presentation.userInputMode, story.context.target?.label, story.roomConfig.id]);
  const renderable = useMemo(() => createRenderableMessages({
    messages: [opening, ...messages.map(message => {
      const profile = getTavernPresentationProfile(message.presentationProfileId);
      const base = { id: message.id, body: message.body, createdAt: message.createdAt, status: message.status,
        presentation: { profileId: profile.id, userInputMode: profile.userInputMode } };
      return message.role === "character" ? { ...base, role: "character" as const, characterId: message.characterId! }
        : { ...base, role: message.role as "user" | "narrator" };
    })],
    characterProfiles: story.characters.map(character => ({ id: character.id, name: character.name, avatar: character.avatar })),
    userName: "我",
  }), [messages, opening, story.characters]);
  const background = backgrounds[story.roomConfig.scenePresetId];
  const overlay = overlays[story.roomConfig.scenePresetId];

  if (!loaded) return <div className="story-empty story-tavern-empty">{error || "正在加载酒馆房间…"}</div>;
  return <section className={`story-original-tavern story-original-theme-${story.roomConfig.scenePresetId}`}>
    <header className="story-original-tavern-header">
      <button type="button" onClick={close} aria-label="关闭章节">←</button>
      <div className="story-original-tavern-icon">♜</div>
      <div><h2>{story.roomConfig.title}</h2><p>{story.context.target?.label || chapter.displayName}</p></div>
      <nav>
        <ButtonLike disabled={!!busy || auto} onClick={() => void submit(draft, true)}>✦ 自推</ButtonLike>
        <ButtonLike disabled={!!busy && !auto} active={auto} onClick={() => {
          if (auto) { autoRef.current = false; setAuto(false); return; }
          autoRef.current = true; setAuto(true); void runAuto();
        }}>{auto ? "Ⅱ 停止" : "✦ 自动"}</ButtonLike>
        <ButtonLike disabled={!!busy || auto} onClick={() => void reset()}>⌫ 清空</ButtonLike>
        <ButtonLike active={sideOpen} onClick={() => setSideOpen(value => !value)}>{sideOpen ? "收起" : "角色"}</ButtonLike>
      </nav>
    </header>
    <div className="story-original-tavern-body">
      <main className="story-original-tavern-main">
        <div className="story-original-message-scroll" style={{ backgroundImage: `${overlay}, url(${background})` }}>
          <div className={`story-original-message-list ${prose ? "prose" : "chat"}`}>
            <details className="story-original-context-card"><summary><span>当前章节</span><strong>{story.context.target?.label || chapter.displayName}</strong></summary>
              <div>{story.context.sections.slice(0, 4).map(section => <section key={section.id}><h4>{section.label}</h4><p>{section.content}</p></section>)}</div>
              <footer>上下文版本 {story.context.revision} · {story.context.sources.length} 个来源</footer></details>
            {renderable.map(message => <MessageView key={message.id} message={message} prose={prose} />)}
            {!!steps.length && <details className="story-execution-trace" open={!!busy}><summary>生成过程 · {busy || `${steps.filter(step => step.status === "done").length}/${steps.length} 步完成`}</summary>
              <ol>{steps.map(step => <li key={step.id} data-status={step.status}><span>{step.status === "done" ? "✓" : step.status === "running" ? "◌" : step.status === "error" ? "!" : "·"}</span><div><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</div></li>)}</ol></details>}
            <div ref={endRef} />
          </div>
        </div>
        <form className="story-original-composer" onSubmit={event => { event.preventDefault(); const text = draft.trim(); if (!text) return; setDraft(""); void submit(text); }}>
          {error && <div className="story-alert">{error}</div>}
          <div><textarea value={draft} disabled={!!busy} placeholder={presentation.composerPlaceholder}
            onChange={event => setDraft(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); const text = draft.trim(); if (!text) return; setDraft(""); void submit(text);
              }
            }} /><button type="submit" disabled={!!busy || !draft.trim()} aria-label="发送">{busy ? "…" : "➤"}</button></div>
        </form>
      </main>
      {sideOpen && <aside className="story-original-side-panel"><header><h3>角色</h3><small>{story.characters.length} 位</small></header>
        <div>{story.characters.map(character => <article key={character.id}><div className="story-character-avatar">{character.name.slice(0, 1)}</div>
          <section><strong>{character.name}</strong><p>{character.description || "暂无角色描述"}</p>
            {character.goals && <small>目标 · {character.goals}</small>}</section></article>)}</div>
        <details><summary>章节上下文</summary>{story.context.sections.map(section => <section key={section.id}><h4>{section.label}</h4><p>{section.content}</p></section>)}</details>
      </aside>}
    </div>
  </section>;
}

function ButtonLike({ children, onClick, disabled = false, active = false }: {
  children: React.ReactNode; onClick(): void; disabled?: boolean; active?: boolean;
}) {
  return <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick}>{children}</button>;
}
