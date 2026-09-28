import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Armchair, BookOpen, Coffee, Film, Gamepad2, Globe, Maximize2, Monitor, Music, Tv, X } from "lucide-react";
import room from "./assets/room.png";
import chair from "./assets/chair.png";
import officeCatIcon from "./assets/office-cat-icon.png";
import { ACTIVITIES, CATS, MODES, deskPoint, favoriteActivities, type Activity, type Point } from "./office-model";
import { advanceOffice, createOffice } from "./office-simulation";
import { APP_DISPLAY_NAME } from "@/product-config";
import "./index.css";

const ICONS = {
  cartoon: Tv,
  movie: Film,
  web: Globe,
  game: Gamepad2,
  work: Monitor,
  rest: Armchair,
  music: Music,
  reading: BookOpen,
  coffee: Coffee,
};
const scenePosition = (p: Point): CSSProperties => ({ left: `${p.x / 14.4}%`, top: `${p.y / 6.72}%` });
function Sprite({ col, row = 2 }: { col: number; row?: number }) {
  const centers = [148, 137, 132, 131, 130, 125];
  return (
    <span aria-hidden="true" className="cat-sprite">
      <span
        className="sprite-cell"
        style={{
          backgroundPosition: `${col * 20}% ${(row * 100) / 3}%`,
          transform: `translate(${(128 - centers[col]) / 2.56}%, ${[-14, 29, 34, 78][row] / 2.56}%)`,
        }}
      />
    </span>
  );
}
function ScreenArt({ activity }: { activity: Activity }) {
  const tile = ACTIVITIES[activity].tile;
  return (
    <span className={`screen-art screen-${activity}`} aria-hidden="true">
      <span
        className="screen-texture"
        style={{ backgroundPosition: `${(tile % 2) * 100}% ${Math.floor(tile / 2) * 50}%` }}
      />
    </span>
  );
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
function useVisiblePage() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
function useOfficeLife(reduced: boolean, visible: boolean) {
  const [world, setWorld] = useState(() => createOffice());
  const live = useRef(world);
  useEffect(() => {
    if (!visible) return;
    let frame = 0,
      previous = performance.now(),
      lastPaint = previous;
    const tick = (now: number) => {
      const before = live.current;
      live.current = advanceOffice(before, Math.min(now - previous, 100), Math.random, reduced);
      previous = now;
      const walking = Object.keys(before.journeys).length || Object.keys(live.current.journeys).length;
      if (walking || live.current.revision !== before.revision || now - lastPaint >= 500) {
        setWorld(live.current);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, visible]);
  return world;
}

export function MewvisOffice() {
  const [selected, setSelected] = useState("Orange");
  const [modal, setModal] = useState<"cat" | "screen" | null>(null);
  const dialogId = useId();
  const reduced = useReducedMotion(),
    visible = useVisiblePage();
  const world = useOfficeLife(reduced, visible);
  const { states, journeys, positions, directions, pending } = world;
  const dialog = useRef<HTMLDialogElement>(null),
    modalTrigger = useRef<HTMLElement | null>(null);
  const cat = CATS.find((c) => c.id === selected)!;
  const state = states[selected],
    journey = journeys[selected],
    queued = pending[selected];
  const moving = Boolean(journey),
    activity = ACTIVITIES[state.activity];
  const favorites = favoriteActivities(cat),
    history = (journey?.destination ?? queued ?? state).recent;
  const screenActivity = moving || state.place === "lounge" ? "standby" : state.activity;
  const screenDefinition = ACTIVITIES[screenActivity],
    ScreenIcon = ICONS[screenDefinition.icon];
  const currentTitle = moving
    ? `正在走动 · 准备${ACTIVITIES[journey.destination.activity].title}`
    : queued
      ? `准备${ACTIVITIES[queued.activity].title}`
      : activity.title;
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      modalTrigger.current?.focus();
    }
  }, [modal]);
  function openModal(id: string, kind: "cat" | "screen", trigger: HTMLElement) {
    modalTrigger.current = trigger;
    setSelected(id);
    setModal(kind);
  }

  return (
    <section className="mewvis-office" aria-label={`${APP_DISPLAY_NAME} 办公室`}>
      <header className="office-header">
        <div className="office-brand">
          <span className="brand-icon">
            <img src={officeCatIcon} alt="" draggable={false} />
          </span>
          <h1>{APP_DISPLAY_NAME} 办公室</h1>
        </div>
      </header>

      <section className="office-scene-scroll" aria-label="猫咪办公室">
        <div className="office-scene">
          <img
            className="room-art"
            src={room}
            alt="阳光照进办公室，左侧有沙发和茶几，右侧有两排六张正向办公桌。"
            draggable={false}
          />
          {CATS.map((c) => {
            const desk = deskPoint(c),
              s = states[c.id],
              screen = journeys[c.id] || s.place === "lounge" ? "standby" : s.activity;
            return (
              <div className="station" key={`desk-${c.id}`}>
                <button
                  type="button"
                  className="desk-screen"
                  style={{
                    left: `${[612, 878, 1172][c.slot % 3] / 14.4}%`,
                    top: `${(c.slot < 3 ? 130 : 378) / 6.72}%`,
                  }}
                  aria-label={`查看 ${c.id} 的屏幕：${ACTIVITIES[screen].title}`}
                  aria-haspopup="dialog"
                  aria-controls={dialogId}
                  onClick={(e) => openModal(c.id, "screen", e.currentTarget)}
                >
                  <ScreenArt activity={screen} />
                  <span className="screen-hover">
                    <Maximize2 size={15} />
                  </span>
                </button>
                <img
                  className="desk-chair"
                  src={chair}
                  alt=""
                  style={scenePosition({ x: desk.x, y: desk.y - 87 })}
                  draggable={false}
                />
              </div>
            );
          })}
          {CATS.map((c) => {
            const s = states[c.id],
              walking = Boolean(journeys[c.id]);
            return (
              <button
                type="button"
                key={c.id}
                className={`scene-cat ${modal && selected === c.id ? "selected" : ""} ${walking ? "walking" : ""} ${s.place === "desk" && !walking ? "at-desk" : "at-lounge"}`}
                style={{ ...scenePosition(positions[c.id]), zIndex: walking ? 20 : 8 }}
                aria-label={`查看 ${c.id} 的详情，${walking ? "走动中" : MODES[s.mode]}，${ACTIVITIES[walking ? journeys[c.id].destination.activity : s.activity].title}`}
                aria-haspopup="dialog"
                aria-controls={dialogId}
                onClick={(e) => openModal(c.id, "cat", e.currentTarget)}
              >
                <span className={`cat-body ${walking && directions[c.id] ? "face-left" : ""}`}>
                  <Sprite col={c.col} row={walking ? 1 : s.place === "desk" ? 0 : s.activity === "nap" ? 3 : 2} />
                </span>
                <span className="cat-name">
                  <i className={`status-dot ${walking ? "moving" : s.mode}`} />
                  {c.id}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <dialog
        ref={dialog}
        id={dialogId}
        className={`office-dialog ${modal === "cat" ? "cat-dialog" : "screen-dialog"}`}
        aria-labelledby={`${dialogId}-title`}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        {modal && (
          <>
            <div className="dialog-heading">
              {modal === "cat" ? (
                <div className="cat-profile">
                  <div className="portrait">
                    <Sprite col={cat.col} />
                  </div>
                  <div>
                    <h2 id={`${dialogId}-title`}>{cat.id}</h2>
                    <p>{cat.role}</p>
                    <span className={`profile-status ${moving ? "moving" : state.mode}`}>
                      <i className={`status-dot ${moving ? "moving" : state.mode}`} />
                      {moving ? "走动中" : MODES[state.mode]}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="eyebrow">
                    {cat.id} · {cat.role}
                  </span>
                  <h2 id={`${dialogId}-title`}>{screenDefinition.title}</h2>
                </div>
              )}
              <button
                type="button"
                className="icon-button"
                autoFocus
                aria-label="关闭弹窗"
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            {modal === "cat" ? (
              <div className="cat-dialog-body">
                <section className="cat-dialog-section activity-details">
                  <span className="eyebrow">{moving ? "正在走动" : "当前在做"}</span>
                  <h3>{currentTitle}</h3>
                  <p>
                    {moving
                      ? "沿着过道慢慢走，准备开始下一件事。"
                      : queued
                        ? `接下来想${ACTIVITIES[queued.activity].title}，等过道空出来就过去。`
                        : activity.description}
                  </p>
                </section>
                <section className="cat-dialog-section personality-details" aria-label={`${cat.id} 的性格与偏好`}>
                  <h3 className="eyebrow">性格与偏好</h3>
                  <p>{cat.personality}</p>
                  <div className="favorite-activities" aria-label={`${cat.id} 的偏好`}>
                    {favorites.map((id) => {
                      const I = ICONS[ACTIVITIES[id].icon];
                      return (
                        <span className="favorite-chip" key={id}>
                          <I size={15} />
                          {ACTIVITIES[id].short}
                        </span>
                      );
                    })}
                  </div>
                </section>
                <section className="cat-dialog-section recent-activities" aria-label={`${cat.id} 最近做过的事情`}>
                  <h3 className="eyebrow">最近做过</h3>
                  {history.length ? (
                    <ol className="activity-history">
                      {history.map((id, index) => {
                        const I = ICONS[ACTIVITIES[id].icon];
                        return (
                          <li key={`${id}-${index}`}>
                            <I size={15} />
                            <span>{ACTIVITIES[id].title}</span>
                            {index === 0 && <small>刚才</small>}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="history-empty">今天的活动刚刚开始。</p>
                  )}
                </section>
              </div>
            ) : (
              <>
                <div className="large-screen">
                  <ScreenArt activity={screenActivity} />
                  <span className="playback-badge">
                    <ScreenIcon size={16} />
                    {screenDefinition.title}
                  </span>
                </div>
                <div className="screen-toolbar">
                  <strong>{screenDefinition.description}</strong>
                  <p>
                    {screenActivity === "standby"
                      ? `猫咪正在${moving ? "走动" : activity.title}，工位暂时无人。`
                      : `正在观察 ${cat.id} 的屏幕`}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </dialog>
    </section>
  );
}
