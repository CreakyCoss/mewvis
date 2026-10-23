import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { BookOpen, Check, ChevronRight, Flower2, Leaf, Pause, Pencil, Sun, TreePalm, X } from "lucide-react";
import type { ApplicationModelOption } from "@mewvis/app-sdk/chat";
import { ACTORS, ART } from "./art";
import { EFFECTS, RESIDENT_IDS, RESIDENTS, TRIGGERS, interpretStoryLaw, type PetitionChoice, type ResidentId, type World } from "./model";
import { Avatar, ClayButton, type BookView } from "./Island";
import { MILESTONES, PLACE_IDS, PLACES, relationshipText, residentGoal, roadStatus } from "./simulation";
import { ReviewPage, StoryThreads } from "./StoryPages";
import { currentFlowerArc } from "./stories";

interface Props {
  world: World; view: BookView; setView: Dispatch<SetStateAction<BookView | null>>;
  draft: string; setDraft(value: string): void;
  resident: ResidentId; setResident(value: ResidentId): void;
  selectedEvent: string | null; setSelectedEvent(value: string | null): void;
  busy: string; error: string; models: ApplicationModelOption[];
  saveLaw(): void; onClose(): void; connect(modelId: string): void; storyMode(): void;
  resolve(id: string, choice: PetitionChoice): void;
  resume(note: string): void; discard(): void;
}

export function Handbook(props: Props) {
  const { world, view, setView, onClose, busy, error } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const rightPage = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => { if (rightPage.current) rightPage.current.scrollTop = 0; }, [view, props.resident, props.selectedEvent]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = dialog.current;
    (target?.querySelector("textarea, button") as HTMLElement | null)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab" && target) {
        const elements = [...target.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex='0']")].filter((element) => element.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);
  return <div className="book-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`island-book book-${view}`} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="book-title" style={{ backgroundImage: `url(${ART.book})` }}>
      <button className="book-close ceramic-button" onClick={onClose} aria-label="合上手册"><X /></button>
      <section className="book-left">
        <BookOpen className="book-emblem" aria-hidden="true" />
        <h1 id="book-title">世界法则</h1><p className="book-subtitle">一条小改动，会长出不同的明天。</p>
        <div className="book-rule" />
        <small className="active-day">第{world.day}天 · 正在生效</small><p className="book-current-law">{world.law.text.includes("，") ? <>{world.law.text.split("，")[0]}，<br />{world.law.text.split("，").slice(1).join("，")}</> : world.law.text}</p>
        <div className="book-vignette" aria-hidden="true">{world.law.effect === "rain" ? <img className="vignette-scene" src={ART.lawRainVignette} alt="" /> : <><img className="vignette-actor" src={ACTORS.atuan} alt="" /><img className="vignette-flowers" src={ART.flowers} alt="" /></>}</div>
        <p className="book-history-note">新法则会替换它，已经发生的故事会被记下。</p>
        <nav className="book-navigation" aria-label="手册章节">{([ ["law", "法则"], ["residents", "岛民"], ["island", "小岛"], ["journal", "手账"], ["settings", "游玩"]] as const).map(([id, label]) => <button key={id} aria-current={view === id || view === "review" && id === "journal" ? "page" : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
        <small className="book-paused"><Pause size={15} />翻阅时，岛上演出暂停。</small>
      </section>
      <section className="book-right" ref={rightPage} tabIndex={0} aria-label="手册内容">
        {view === "law" && <LawPage {...props} />}
        {view === "residents" && <ResidentPage {...props} />}
        {view === "journal" && <JournalPage {...props} />}
        {view === "settings" && <SettingsPage {...props} />}
        {view === "island" && <IslandPage {...props} />}
        {view === "review" && <ReviewPage world={world} busy={busy} resume={props.resume} discard={props.discard} />}
        {error && <p className="book-error" role="alert">{error}</p>}
        {busy && <p className="book-busy" role="status">{busy}</p>}
      </section>
    </div>
  </div>;
}

function LawPage({ world, draft, setDraft, busy, saveLaw, onClose }: Props) {
  let preview = null;
  try { preview = interpretStoryLaw(draft, world.day + 1); } catch { /* Ambiguous drafts stay editable. */ }
  return <>
    <h2><Pencil />写下新的法则</h2>
    <label className="draft-label" htmlFor="new-island-law">新法则</label>
    <textarea id="new-island-law" className="law-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} rows={2} disabled={!!busy} aria-describedby="law-writing-hint" />
    <p id="law-writing-hint" className="writing-hint">{world.mode === "intelligent" ? "写下时，会先请小岛理解这句话。" : "一句话，改变一件小事。"}</p>
    {world.dayDraft && <p className="writing-hint">写下新法则会放弃尚未发生的演绎草稿。</p>}
    <h3 className="interpretation-title"><Leaf />手册{world.mode === "intelligent" ? "暂时" : ""}这样理解</h3>
    <dl className="law-interpretation"><div><dt>影响对象</dt><dd>全岛居民</dd></div><div><dt>触发条件</dt><dd>{preview ? TRIGGERS[preview.trigger] : "等你把条件写清楚"}</dd></div><div><dt>发生变化</dt><dd>{preview ? EFFECTS[preview.effect] : "可以下雨，也可以开花"}</dd></div></dl>
    <div className="effective-note"><Sun /><span><strong>第{world.day + 1}天开始生效</strong><small>将替换当前法则，今天还不会改变。</small></span></div>
    <div className="book-actions"><button className="text-button" onClick={onClose}>先不改</button><ClayButton onClick={saveLaw} disabled={!!busy || !draft.trim() || draft.trim() === (world.pendingLaw ?? world.law).text}><Pencil size={19} />写下新法则<ChevronRight size={19} /></ClayButton></div>
  </>;
}

function ResidentPage({ world, resident, setResident }: Props) {
  const actor = RESIDENTS[resident];
  const person = world.island.residents[resident];
  return <><h2><Leaf />认识岛上的人</h2><div className="resident-selector">{RESIDENT_IDS.map((id) => <button key={id} onClick={() => setResident(id)} aria-pressed={id === resident}><Avatar id={id} /><span>{RESIDENTS[id].name}</span></button>)}</div>
    <div className="resident-profile"><img src={ACTORS[resident]} alt={actor.name} /><div><h3>{actor.name}</h3><small>{actor.role}</small><p>{actor.traits}</p></div></div>
    <dl className="profile-facts"><div><dt>眼下的心愿</dt><dd>{residentGoal(world.island, resident)}</dd></div><div><dt>现在在</dt><dd>{PLACES[person.place].name}</dd></div><div><dt>知道的事</dt><dd>{person.knownFacts.slice(-3).map((fact) => <p className="known-fact" key={fact}>{fact}</p>)}</dd></div></dl>
    <h3 className="section-caption">和邻居的相处</h3><div className="resident-relations">{RESIDENT_IDS.filter((id) => id !== resident).map((id) => <button key={id} onClick={() => setResident(id)}><Avatar id={id} /><span><strong>{RESIDENTS[id].name}</strong><small>{relationshipText(person.relations[id])}</small></span></button>)}</div>
    {!!person.milestones.length && <p className="resident-milestones">{person.milestones.map((key) => MILESTONES[key]).join(" · ")}</p>}
    <h3 className="section-caption">留在心里的事</h3><div className="resident-memories">{person.memories.length ? [...person.memories].reverse().slice(0, 6).map((memory) => <p key={memory.eventId}><small>第{memory.day}天</small>{memory.text}</p>) : <p>还没有新的经历，明天去看看吧。</p>}</div>
  </>;
}

function JournalPage({ world, selectedEvent, setSelectedEvent, setView, resolve, busy }: Props) {
  const petition = !world.pendingLaw && world.petitions.find((p) => p.lawId === world.law.id && !p.resolution);
  const selected = world.events.find((event) => event.id === selectedEvent);
  const draftLink = world.dayDraft && <button className="draft-link" onClick={() => setView("review")}><BookOpen size={18} /><span>明天有一份待续的演绎<small>第{world.dayDraft.day}天还未发生，点击查看依据与复核。</small></span><ChevronRight size={18} /></button>;
  if (petition && !selected) return <>{draftLink}<h2><Leaf />一封岛民请愿</h2><p className="petition-greeting">给写下法则的你：</p><h3 className="petition-title">{petition.title}</h3><p className="petition-body">{petition.text}</p><div className="petition-signatures"><Avatar id="xiaoman" /><Avatar id="gardener" /><span>小满和青禾一起写下</span></div><p className="writing-hint">留下一条{petition.kind === "repeat" ? "解释" : "约定"}，从明天起，大家都会照着它生活。{world.dayDraft ? "当前的演绎草稿将放弃，按新的选择重新安排。" : ""}</p><div className="petition-choices">{petition.options.map((option) => <button key={option.id} disabled={!!busy} onClick={() => resolve(petition.id, option.id)}><strong>{option.title}</strong><span>{option.description}</span><ChevronRight /></button>)}</div><button className="text-button" onClick={() => setSelectedEvent(world.events.at(-1)?.id ?? null)}>先翻看发生了什么</button><StoryThreads world={world} /></>;
  return <><h2><BookOpen />小岛记得这些事</h2>
    {selected ? <div className="event-detail"><button className="text-button" onClick={() => setSelectedEvent(null)}>返回手账</button><div className="event-person"><Avatar id={selected.residentId} /><span>{RESIDENTS[selected.residentId].name}<small>第{selected.day}天 · {selected.time}</small></span></div><blockquote>“{selected.speech}”</blockquote><p>{selected.text}</p>{selected.outcome && <><h3 className="section-caption">这件事留下了什么</h3><ul className="event-consequences">{selected.outcome.notes.map((note) => <li key={note}>{note}</li>)}</ul></>}<h3 className="section-caption">这次为什么会这样</h3><p className="event-reason">{selected.judgment.reason}</p><small className="event-source">{selected.judgment.source === "plugin" ? "已记录智能判断插件的结论" : "来自手写的故事情节"}</small><p className="event-law-ref">依据法则：{selected.lawId === world.law.id ? world.law.text : "当时生效的世界法则"}</p></div>
      : <>{draftLink}<StoryThreads world={world} /><h3 className="section-caption">最近发生的事</h3><div className="journal-full">{[...world.events].reverse().slice(0, 24).map((event) => <button key={event.id} onClick={() => setSelectedEvent(event.id)}><Avatar id={event.residentId} /><span><small>第{event.day}天 · {event.time}</small><strong>{event.text}</strong></span><ChevronRight size={15} /></button>)}</div></>}
    {world.petitions.some((p) => p.lawId === world.law.id && p.resolution) && !selected && <p className="writing-hint">你的解释也记在这里：{world.pendingInterpretation === "once" || world.interpretation === "once" ? "重复的真话不再开花。" : "每次真话都算，大家一起照顾小路。"}</p>}
  </>;
}

function IslandPage({ world }: Props) {
  const { island } = world, { shop } = island;
  const agreement = currentFlowerArc(world);
  const changes = world.events.filter((event) => event.day === world.day && event.outcome).flatMap((event) => event.outcome!.notes).slice(0, 5);
  return <><h2><TreePalm />小岛留下的变化</h2><p className="island-road-status"><Leaf />小路{roadStatus(island)}<small>花会留到明天，收拢后可以再做成鲜花伞。</small></p>
    {(agreement?.pendingPolicy || agreement?.policy) && <p className="story-ending">{agreement.pendingPolicy ? "明天开始的约定：" : "大家正在照着约定生活："}{(agreement.pendingPolicy ?? agreement.policy) === "harvest" ? "优先收拢路边的花，把回收的材料做成鲜花伞。" : "小满到果园试种，居民一起收拢路边旧花。"}</p>}
    <h3 className="section-caption">诚实雨伞铺的小账</h3><dl className="shop-ledger"><div><dt>待装饰的旧雨伞</dt><dd>{shop.plainUmbrellas}把</dd></div><div><dt>已经编好的鲜花伞</dt><dd>{shop.flowerUmbrellas}把</dd></div><div><dt>花篮里的材料</dt><dd>{shop.looseFlowers}簇</dd></div><div><dt>开店以来</dt><dd>卖出{shop.sold}把 · 留下{shop.coins}枚零钱</dd></div></dl>
    <h3 className="section-caption"><Flower2 size={17} />花留在了哪里</h3><div className="flower-register">{PLACE_IDS.filter((id) => island.flowers[id] > 0).map((id) => <p key={id}><span>{PLACES[id].name}</span><strong>{island.flowers[id]}簇</strong><small>{id !== "orchard" && island.flowers[id] >= 4 ? "需要给小路留点空隙" : "还可以慢慢走过"}</small></p>)}{!PLACE_IDS.some((id) => island.flowers[id]) && <p className="writing-hint">小路上还没有法则留下的花。</p>}</div>
    {!!changes.length && <><h3 className="section-caption">今天做成的小事</h3><ul className="event-consequences">{changes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul></>}
  </>;
}

function SettingsPage({ world, connect, storyMode, models, busy }: Props) {
  return <><h2><Sun />来小岛住一会</h2><p className="guide-intro">写下一条小小的法则，推进一天，看看居民怎样把日子过下去。</p><ol className="play-guide"><li><span>1</span><p><strong>改一条法则</strong><small>真话、谎言、帮助和夸奖，可以带来雨或花。</small></p></li><li><span>2</span><p><strong>把时间往前推一点</strong><small>新法则从下一天起生效，旧故事会留下。</small></p></li><li><span>3</span><p><strong>听听岛民的心事</strong><small>点居民看心愿，翻手账看缘由，替请愿留下解释。</small></p></li></ol>
    <h3 className="section-caption">想怎样度过这一天</h3><div className="play-modes"><button disabled={!!busy} className={world.mode === "story" ? "selected" : ""} onClick={storyMode}><span><strong>故事模式</strong><small>体验已经写好的小故事，随时都能玩。</small></span>{world.mode === "story" && <Check />}</button><button disabled={!!busy} className={world.mode === "intelligent" ? "selected" : ""} onClick={() => connect(world.modelId)}><span><strong>智能演绎</strong><small>居民依照目标行动，由已启用的智能判断插件裁定。</small></span>{world.mode === "intelligent" ? <Check /> : <ChevronRight />}</button></div>
    {world.dayDraft && <p className="writing-hint">切换模型或返回故事模式会放弃尚未发生的演绎草稿。</p>}
    {models.length > 0 && <label className="model-choice">演绎使用的模型<select value={models.some((model) => model.id === world.modelId) ? world.modelId : ""} disabled={!!busy} onChange={(event) => { if (event.target.value) connect(event.target.value); }}><option value="" disabled>选择一个已配置的模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.provider.name} / {model.modelName}</option>)}</select></label>}
    <p className="writing-hint">{world.mode === "intelligent" ? "已经连接。遇到信息不足时，小岛会先停下来等你，不会悄悄换成固定故事。" : "智能演绎使用 Mewvis 中的模型与“智能判断”插件，需要先在宿主中配置并启用。"}</p>
  </>;
}
