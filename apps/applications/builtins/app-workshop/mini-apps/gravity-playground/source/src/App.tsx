import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  WIDTH,
  HEIGHT,
  MAX_BODIES,
  addOrbiter,
  advance,
  createWorld,
  launch,
  type Aim,
  type Point,
} from "./engine";
import { render } from "./renderer";
import { useSettings } from "./useSettings";

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    spark: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z",
    pause: "M8 5v14M16 5v14",
    play: "m8 5 11 7-11 7Z",
    reset: "M3 11a9 9 0 1 1 2 7M3 4v7h7",
    plus: "M12 5v14M5 12h14",
    orbit: "M12 3a9 9 0 1 0 9 9M3 3l18 18M17 3h4v4",
  };
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}

const INTRO = "在星空中拖动，发射一颗属于你的行星。";
export default function App() {
  const storage = useSettings();
  const { settings, setSettings, ready } = storage;
  const { binary, gravity, speed, trails } = settings;
  const canvas = useRef<HTMLCanvasElement>(null),
    world = useRef(createWorld()),
    aim = useRef<Aim | null>(null);
  const [paused, setPaused] = useState(false),
    [count, setCount] = useState(4),
    [notice, setNotice] = useState(INTRO);

  useEffect(() => {
    if (ready) {
      world.current = createWorld(settings);
      setCount(4);
      setPaused(false);
    }
  }, [ready]);
  useEffect(() => {
    world.current.settings = { ...settings };
  }, [settings]);
  useEffect(() => {
    if (!ready) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let frame = 0,
      last: number | undefined;
    const draw = (time: number) => {
      advance(world.current, last === undefined ? 0 : (time - last) / 1000);
      last = time;
      render(ctx, world.current, aim.current);
      const next = world.current.bodies.length;
      setCount((previous) => (previous === next ? previous : next));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  function pause() {
    world.current.paused = !world.current.paused;
    setPaused(world.current.paused);
  }
  function reset(mode = binary) {
    world.current = createWorld({ ...settings, binary: mode });
    aim.current = null;
    setPaused(false);
    setCount(4);
    setSettings((s) => ({ ...s, binary: mode }));
    setNotice(mode ? "两颗恒星，一场更难预测的引力舞蹈。" : INTRO);
  }
  function add() {
    if (!addOrbiter(world.current)) {
      setNotice(`宇宙有点拥挤，最多放入 ${MAX_BODIES} 颗行星。`);
      return;
    }
    setCount(world.current.bodies.length);
    setNotice("新行星已加入。试试调大引力，看看轨道会怎样变化。");
  }
  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * WIDTH,
      ((event.clientY - box.top) / box.height) * HEIGHT,
    ];
  }
  const saving =
    storage.status === "saving"
      ? "正在保存设置"
      : storage.status === "error"
        ? "设置保存失败"
        : "设置已保存";
  return (
    <main className="gravity-app">
      <header className="app-top">
        <div className="title-group">
          <span className="app-logo">
            <Icon name="orbit" />
          </span>
          <div>
            <h1>引力游乐场</h1>
            <p>给宇宙一点推力，看看会发生什么。</p>
          </div>
        </div>
        <span className="local-badge">
          <i />
          互动小应用
        </span>
      </header>
      {!ready ? (
        <div className="loading-state">
          <Icon name="orbit" />
          <h2>
            {storage.loadError ? "暂时没能读取设置" : "正在打开你的微型宇宙…"}
          </h2>
          {storage.loadError && (
            <button onClick={storage.reload}>重新读取</button>
          )}
        </div>
      ) : (
        <>
          <section className="playground">
            <div className="universe">
              <div className="scene-label">
                <span className="live-dot" />
                {binary ? "双星系统" : "微型太阳系"}
                <small>ORBIT PLAYGROUND</small>
              </div>
              <canvas
                ref={canvas}
                width={WIDTH}
                height={HEIGHT}
                tabIndex={0}
                aria-label="互动星空：拖动发射行星，空格键暂停，回车键增加行星"
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    pause();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  } else if (e.key === "Escape") aim.current = null;
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !e.isPrimary) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  aim.current = { start: p, end: p };
                }}
                onPointerMove={(e) => {
                  if (aim.current) aim.current.end = point(e);
                }}
                onPointerCancel={() => {
                  aim.current = null;
                }}
                onLostPointerCapture={() => {
                  aim.current = null;
                }}
                onPointerUp={(e) => {
                  const a = aim.current;
                  if (!a) return;
                  const added = launch(world.current, a.start, point(e));
                  aim.current = null;
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  setCount(world.current.bodies.length);
                  setNotice(
                    added
                      ? "发射成功！初始方向与速度，决定它接下来的旅程。"
                      : `宇宙有点拥挤，最多放入 ${MAX_BODIES} 颗行星。`,
                  );
                }}
              />
              <div className="scene-hint">
                <span>↗</span> 拖动发射行星 <b>·</b> 拖得越远，速度越快
              </div>
              <div className="scale">
                SPACE 暂停<span>ENTER 加一颗</span>
              </div>
            </div>
            <aside className="controls" aria-label="宇宙控制室">
              <div className="control-title">
                宇宙控制室<span>✧</span>
              </div>
              <p className="control-intro">
                没有任务，没有终点。
                <br />
                亲手试一试引力的魔法。
              </p>
              <div className="setting">
                <span className="setting-label">选择一个宇宙</span>
                <div className="preset">
                  <button
                    aria-pressed={!binary}
                    className={!binary ? "active" : ""}
                    onClick={() => reset(false)}
                  >
                    ☀ 微型太阳系
                  </button>
                  <button
                    aria-pressed={binary}
                    className={binary ? "active" : ""}
                    onClick={() => reset(true)}
                  >
                    ✦ 双星系统
                  </button>
                </div>
              </div>
              <div className="setting">
                <label htmlFor="gravity">
                  引力强度<strong>{gravity.toFixed(1)}×</strong>
                </label>
                <input
                  id="gravity"
                  type="range"
                  min=".3"
                  max="2"
                  step=".1"
                  value={gravity}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, gravity: +e.target.value }))
                  }
                />
                <div className="range-ends">
                  <span>轻轻牵引</span>
                  <span>强力吸引</span>
                </div>
              </div>
              <div className="setting">
                <label htmlFor="speed">
                  时间流速<strong>{speed.toFixed(1)}×</strong>
                </label>
                <input
                  id="speed"
                  type="range"
                  min=".2"
                  max="3"
                  step=".2"
                  value={speed}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, speed: +e.target.value }))
                  }
                />
              </div>
              <button
                className="toggle"
                aria-pressed={trails}
                onClick={() =>
                  setSettings((s) => ({ ...s, trails: !s.trails }))
                }
              >
                <span>显示运动轨迹</span>
                <span className={"switch " + (trails ? "on" : "")} />
              </button>
              <button
                className="add-button"
                onClick={add}
                disabled={count >= MAX_BODIES}
              >
                <Icon name="plus" />
                加一颗行星
              </button>
              <div className="transport">
                <button onClick={pause}>
                  <Icon name={paused ? "play" : "pause"} />
                  {paused ? "继续运行" : "暂停宇宙"}
                </button>
                <button onClick={() => reset()} aria-label="重置宇宙">
                  <Icon name="reset" />
                </button>
              </div>
              <div className="stat">
                <span>正在漫游</span>
                <strong>
                  {count}
                  <small>颗行星</small>
                </strong>
                <div className="planet-dots">
                  {world.current.bodies.map((b, i) => (
                    <i key={i} style={{ background: b.color }} />
                  ))}
                </div>
              </div>
            </aside>
          </section>
          <footer className="app-footer">
            <span role="status">
              <i /> {notice}
            </span>
            <div className="footer-meta">
              {storage.status === "error" ? (
                <button className="retry-save" onClick={storage.retrySave}>
                  {saving} · 重试
                </button>
              ) : (
                <span>{saving}</span>
              )}
              <small>固定恒星 · 二维近似模型</small>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
