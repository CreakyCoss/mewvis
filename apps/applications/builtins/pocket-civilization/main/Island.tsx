import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { BookOpen, Check, ChevronRight, CloudSun, Leaf, Minus, Pause, Pencil, Play, Plus, Sun, TreePalm } from "lucide-react";
import { ACTORS, ART } from "./art";
import { RESIDENT_IDS, RESIDENTS, type IslandEvent, type ResidentId, type World } from "./model";

export type BookView = "law" | "journal" | "residents" | "settings";
export function Avatar({ id, className = "" }: { id: ResidentId; className?: string }) {
  return <span className={`resident-avatar ${className}`} style={{ backgroundColor: RESIDENTS[id].color }}><img src={ACTORS[id]} alt="" /></span>;
}
export function ClayButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`clay-button ${className}`} style={{ ...props.style, backgroundImage: `url(${ART.clayButton})` }}>{children}</button>;
}

interface Props {
  world: World; ready: boolean; busy: string; paused: boolean;
  open(view: BookView, id?: string): void;
  onPause(): void; onAdvance(): void; onResident(id: ResidentId): void; onWithdraw(): void;
}

export function Island({ world, ready, busy, paused, open, onPause, onAdvance, onResident, onWithdraw }: Props) {
  const shell = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1487, height: 1058 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!shell.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(shell.current);
    return () => observer.disconnect();
  }, []);
  const compact = size.width < 800;
  const scale = (compact ? Math.min(size.width / 1487, size.height / 1058) : Math.max(size.width / 1487, size.height / 1058)) * zoom;
  const today = world.events.filter((event) => event.day === world.day);
  const visibleEvents = world.day === 7 ? today.slice(-2) : today.slice(-3);
  const pendingPetition = !world.pendingLaw && world.petitions.find((p) => p.lawId === world.law.id && !p.resolution);
  const displayedLaw = world.pendingLaw ?? world.law;
  return <div ref={shell} className={`island-shell ${paused ? "is-paused" : ""} ${busy ? "is-working" : ""} ${world.pendingLaw ? "has-pending-law" : ""}`} data-testid="pocket-world" data-day={world.day}>
    <div className="sea-ambience" style={{ backgroundImage: `url(${ART.island})` }} aria-hidden="true" />
    <div className="world-stage" style={{ width: 1487, height: 1058, top: compact ? "42%" : "50%", transform: `translate(-50%, -50%) scale(${scale})` }}>
      <img className="island-landscape" src={ART.island} alt="雨点镇：面包店、雨伞铺、果园与小石桥组成的一座海中小岛" draggable={false} />
      <div className="world-light" key={world.day} />
      {RESIDENT_IDS.map((id) => {
        const actor = RESIDENTS[id];
        const event = [...today].reverse().find((event) => event.residentId === id);
        return <div key={id} className={`resident-position resident-${id}`} style={{ left: actor.x, top: actor.y, zIndex: Math.round(actor.y) }}>
          {event?.effect === "flowers" && <img className="flower-effect" src={ART.flowers} alt={`${actor.name}脚边开出小花`} />}
          <button className="resident-body" onClick={() => onResident(id)} aria-label={`看看${actor.name}：${actor.role}`} title={`${actor.name} · ${actor.role}`}>
            <img src={ACTORS[id]} alt={actor.name} draggable={false} />
          </button>
          {event?.effect === "rain" && <img className="rain-effect" src={ART.rain} alt={`${actor.name}头顶正在下雨`} />}
          {id === "atuan" && event && <button className="resident-speech" onClick={() => open("journal", event.id)} aria-label={`查看这件事：${event.speech}`}>{event.speech}</button>}
        </div>;
      })}
    </div>

    <header className="island-identity">
      <button className="town-plaque" style={{ backgroundImage: `url(${ART.titlePlaque})` }} onClick={() => open("settings")} aria-label="打开雨点镇游玩手册">
        <TreePalm aria-hidden="true" /><span><strong>雨点镇</strong><small>口袋文明 · {world.mode === "story" ? "故事模式" : "智能演绎"}</small></span>
      </button>
      <div className="day-plaque" style={{ backgroundImage: `url(${ART.titlePlaque})` }} aria-label={`第${world.day}天${world.day === 7 ? "午后" : "上午"}`}>
        {world.law.effect === "rain" ? <CloudSun aria-hidden="true" /> : <Sun aria-hidden="true" />}
        <span>第{world.day}天 · {world.day === 7 ? "午后" : "上午"}</span>
      </div>
    </header>

    <div className="island-controls" aria-label="小岛视图控制">
      <div className="control-row"><button className="ceramic-button" onClick={() => open("settings")} aria-label="打开小岛手册"><BookOpen /></button><button className="ceramic-button" onClick={onPause} aria-label={paused ? "播放岛上演出" : "暂停岛上演出"}>{paused ? <Play /> : <Pause />}</button></div>
      <div className="zoom-controls"><button onClick={() => setZoom((value) => Math.min(1.4, Number((value + .1).toFixed(1))))} disabled={zoom >= 1.4} aria-label="放大小岛"><Plus /></button><button onClick={() => setZoom((value) => Math.max(.8, Number((value - .1).toFixed(1))))} disabled={zoom <= .8} aria-label="缩小小岛"><Minus /></button></div>
    </div>

    <section className={`island-journal ${visibleEvents.length === 3 ? "journal-three-events" : ""}`} style={{ backgroundImage: `url(${ART.notebook})` }} aria-label="岛上新鲜事">
      <button className="journal-heading" onClick={() => open("journal")}><Leaf /><strong>岛上新鲜事</strong>{world.day > 7 && <small>第{world.day}天</small>}</button>
      <div className="journal-events">{visibleEvents.map((event) => <EventRow key={event.id} event={event} onClick={() => open("journal", event.id)} />)}</div>
      <button className={`journal-link ${pendingPetition ? "petition-link" : ""}`} onClick={() => open("journal")}>{pendingPetition ? "有一封岛民请愿" : "翻看昨天"}<ChevronRight size={16} /></button>
    </section>

    <section className={`world-law ${world.pendingLaw ? "law-pending" : ""}`} style={{ backgroundImage: `url(${ART.scroll})` }} aria-label="世界法则">
      <div className="law-copy">
        <div className="law-eyebrow">{world.pendingLaw ? <Check /> : <BookOpen />}<span>{world.pendingLaw ? `已写好 · 第${world.day + 1}天生效` : "世界法则"}</span></div>
        <strong className="law-sentence">{displayedLaw.text}</strong>
        {world.pendingLaw ? <small className="current-law">当前：{world.law.text}</small> : world.pendingInterpretation ? <small>你的解释将从明天生效。</small> : world.interpretation ? <small>{world.interpretation === "once" ? "同一件事，第一次说出时才会开花。" : "每次真话都算，大家一起照顾小路。"}</small> : null}
      </div>
      <div className="law-actions"><button className="ceramic-button edit-law" onClick={() => open("law")} disabled={!ready || !!busy} aria-label="改写世界法则"><Pencil /><small>改写</small></button>{world.pendingLaw && <button className="withdraw-law" onClick={onWithdraw} disabled={!!busy}>撤回</button>}</div>
    </section>

    <div className="advance-day"><small>{world.pendingLaw ? "让新法则从明天开始" : "看看明天会发生什么"}</small><ClayButton disabled={!ready || !!busy} onClick={onAdvance} aria-label="推进一天"><Sun /><span>{busy ? "小岛正在醒来" : "推进一天"}</span><ChevronRight /></ClayButton></div>
  </div>;
}

function EventRow({ event, onClick }: { event: IslandEvent; onClick(): void }) {
  return <button className="journal-event" onClick={onClick}><Avatar id={event.residentId} /><span><time>{event.time}</time><span>{event.text}</span></span></button>;
}
