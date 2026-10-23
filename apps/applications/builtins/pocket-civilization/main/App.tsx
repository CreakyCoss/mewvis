import { useEffect, useRef, useState } from "react";
import type { ApplicationModelOption } from "@mewvis/app-sdk/chat";
import { IslandIntelligence } from "./intelligence";
import { WorldRepository } from "./repository";
import { applyPlan, createWorld, interpretStoryLaw, planStoryDay, resolvePetition, scheduleLaw, withdrawLaw, type ResidentId, type World } from "./model";
import { Island, type BookView } from "./Island";
import { Handbook } from "./Handbook";
import { saveDayDraft } from "./day-draft";
import "./styles.css";

export default function App() {
  const [world, setWorld] = useState<World>(() => createWorld());
  const worldRef = useRef(world);
  const repository = useRef<WorldRepository | null>(null);
  const intelligence = useRef<IslandIntelligence | null>(null);
  const operation = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<BookView | null>(null);
  const [resident, setResident] = useState<ResidentId>("atuan");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [draft, setDraft] = useState("说真话的人，身边会开花。");
  const [paused, setPaused] = useState(false);
  const [models, setModels] = useState<ApplicationModelOption[]>([]);
  const [performanceId, setPerformanceId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    repository.current ??= new WorldRepository();
    void repository.current.load().then((loaded) => {
      if (!alive) return;
      worldRef.current = loaded;
      setWorld(loaded);
      if (loaded.pendingLaw) setDraft(loaded.pendingLaw.text);
      if (loaded.dayDraft) setNotice("有一份明天的演绎草稿待续，已完成的判断都留着。");
      setReady(true);
    }).catch((e) => { if (alive) setError(message(e)); });
    return () => { alive = false; operation.current?.abort(); intelligence.current?.detach(); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const getIntelligence = () => (intelligence.current ??= new IslandIntelligence());
  const commit = async (next: World) => {
    if (!repository.current) throw new Error("小岛还没准备好。");
    const saved = await repository.current.save(next, worldRef.current.revision);
    worldRef.current = saved;
    setWorld(saved);
    return saved;
  };
  const run = async (label: string, action: (signal: AbortSignal) => Promise<void>) => {
    if (lock.current || !ready) return;
    lock.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label); setError("");
    try { await action(controller.signal); }
    catch (e) { setError(message(e)); if (worldRef.current.dayDraft && !controller.signal.aborted) setView("review"); }
    finally {
      if (operation.current === controller) operation.current = null;
      lock.current = false; setBusy("");
    }
  };
  const open = (next: BookView, id?: string) => {
    setError("");
    if (next === "journal") setSelectedEvent(id ?? null);
    if (next === "law" && worldRef.current.pendingLaw) setDraft(worldRef.current.pendingLaw.text);
    setView(next);
  };
  const saveLaw = () => run("正在把法则记进手册…", async (signal) => {
    const current = worldRef.current;
    if (draft.trim() === (current.pendingLaw ?? current.law).text) throw new Error("这条法则已经记好了，试着写一点新的变化。");
    let law;
    if (current.mode === "intelligent") {
      await getIntelligence().connect(current.modelId);
      signal.throwIfAborted();
      law = await getIntelligence().interpretLaw(draft, current.day + 1, signal, setBusy);
    } else law = interpretStoryLaw(draft, current.day + 1);
    signal.throwIfAborted();
    await commit(scheduleLaw(current, law));
    setView(null);
    setNotice(`新法则已写好，第${current.day + 1}天开始生效。`);
  });
  const advance = (note?: string) => {
    if (worldRef.current.dayDraft && note === undefined) { open("review"); return; }
    return run("小岛正在醒来…", async (signal) => {
    let current = worldRef.current;
    if (current.dayDraft && note !== undefined && note.trim() !== current.dayDraft.note) {
      current = await commit(saveDayDraft(current, { ...current.dayDraft, note: note.trim().slice(0, 300) }));
    }
    const plan = current.mode === "intelligent"
      ? await (async () => {
          await getIntelligence().connect(current.modelId);
          signal.throwIfAborted();
          return getIntelligence().planDay(current, signal, setBusy, commit, note);
        })()
      : planStoryDay(current);
    signal.throwIfAborted();
    const next = applyPlan(worldRef.current, plan);
    await commit(next);
    setView(null);
    setPerformanceId(next.revision);
    setNotice(plan.petition ? "有一封新的岛民请愿，记在手账里了。" : `第${next.day}天，小岛又长出了一点新故事。`);
    });
  };
  const connect = (modelId: string) => run("正在连接智能演绎…", async (signal) => {
    const service = getIntelligence();
    let connected;
    try { connected = await service.connect(modelId); }
    catch (error) { setModels(service.modelOptions); throw error; }
    signal.throwIfAborted();
    setModels(connected.models);
    const current = worldRef.current;
    await commit({ ...current, dayDraft: current.modelId === connected.modelId ? current.dayDraft : null, mode: "intelligent", modelId: connected.modelId, revision: current.revision + 1, updatedAt: Date.now() });
    setNotice("智能演绎已连接。下一天会由居民的目标与判断共同展开。");
  });
  const storyMode = () => run("正在记下游玩方式…", async () => {
    const current = worldRef.current;
    await commit({ ...current, dayDraft: null, mode: "story", revision: current.revision + 1, updatedAt: Date.now() });
    setNotice("已切换到手写的故事模式。");
  });

  return <div className="pocket-app">
    <Island world={world} ready={ready} busy={busy} paused={paused || !!view} performanceId={performanceId} open={open}
      onPause={() => setPaused((value) => !value)} onAdvance={() => void advance()}
      onResident={(id) => { setResident(id); open("residents"); }}
      onWithdraw={() => void run("正在撤回新法则…", async () => { await commit(withdrawLaw(worldRef.current)); setNotice("已撤回，今天的法则继续留在手册里。"); })} />
    {view && <Handbook world={world} view={view} setView={(value) => { setError(""); setView(value); }} draft={draft} setDraft={setDraft}
      resident={resident} setResident={setResident} selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent}
      busy={busy} error={error} models={models} saveLaw={saveLaw}
      onClose={() => { if (busy) operation.current?.abort(); setView(null); }}
      connect={connect} storyMode={storyMode}
      resume={(note) => void advance(note)} discard={() => void run("正在收起演绎草稿…", async () => { await commit(saveDayDraft(worldRef.current, null)); setView("journal"); setNotice("草稿已放下，今天的日期和资源保持原样。"); })}
      resolve={(id, choice) => void run("正在记下你的主意…", async () => { await commit(resolvePetition(worldRef.current, id, choice)); setNotice("你的选择已记下，从明天起生效。"); })} />}
    {!view && error && <div className="pocket-alert" role="alert"><span>{error}</span><button onClick={() => setError("")}>收起</button></div>}
    {notice && !view && <div className="pocket-notice" role="status">{notice}</div>}
    {!!busy && <div className="pocket-progress" role="status"><span className="pocket-spinner" />{busy}<button onClick={() => operation.current?.abort()}>停止</button></div>}
    {!ready && !error && <div className="pocket-notice" role="status">正在翻开小岛的手账…</div>}
  </div>;
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
