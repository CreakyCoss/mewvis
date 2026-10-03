import { useEffect, useState } from "react";
import { art } from "./art";
import { LEVELS } from "./levels";
import { solve } from "./engine";
import { unlocked, updateBoard } from "./progress";
import { useProgress } from "./useProgress";
import { Icon, Thumbnail } from "./visuals";
import { Game } from "./Game";

const solutions = Object.fromEntries(
  LEVELS.map((level) => {
    const result = solve(level);
    return [level.id, result.status === "solved" ? result.placements : {}];
  }),
);
const number = (n: number) => String(n).padStart(2, "0");

export default function App() {
  const storage = useProgress();
  const { progress, setProgress, ready, status } = storage;
  const [screen, setScreen] = useState<"map" | "game">("map");
  const [choice, setChoice] = useState(1);
  const [mapMessage, setMapMessage] = useState("");
  useEffect(() => {
    if (ready) setChoice(progress.current);
  }, [ready]);
  const level = LEVELS[progress.current - 1] ?? LEVELS[0];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, level.id]);
  const chosen = LEVELS[choice - 1];
  const done = progress.completed.includes(choice);
  const started = Object.keys(progress.boards[choice] ?? {}).length > 0;
  function enter(id: number, replay = false) {
    if (!unlocked(progress, id)) return;
    setProgress((p) => ({
      ...p,
      current: id,
      boards: replay ? { ...p.boards, [id]: {} } : p.boards,
    }));
    setChoice(id);
    setScreen("game");
  }
  return (
    <main
      className={"cat-app " + (screen === "map" ? "map-screen" : "game-screen")}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-art">
            <img src={art.box} alt="" />
            <img src={art.cream} alt="" />
          </div>
          <div>
            <h1>猫猫收纳所</h1>
            <p>每一只猫，都有刚刚好的位置。</p>
          </div>
        </div>
        {ready && (
          <p className="chapter-progress">
            <span className="progress-label">
              {screen === "map" ? "已完成" : "纸箱小屋 ·"}
            </span>{" "}
            <strong>{progress.completed.length} / 8</strong>{" "}
            {screen === "map" ? "关" : "完成"}
          </p>
        )}
      </header>
      {!ready ? (
        <div className="loading-state">
          <img src={art.lilac} alt="熟睡的芋泥" />
          <h2>
            {storage.loadError ? "暂时没能读到进度" : "猫猫正在找舒服的位置…"}
          </h2>
          <p>
            {storage.loadError
              ? "重试后会接着读取原来的存档。"
              : "正在打开你的纸箱小屋"}
          </p>
          {storage.loadError && (
            <button className="primary" onClick={storage.reload}>
              重新读取
            </button>
          )}
        </div>
      ) : screen === "map" ? (
        <>
          <nav className="chapters" aria-label="主题章节">
            <button className="chapter active" aria-current="page">
              <strong>纸箱小屋</strong>
              <span className="chapter-meta">
                <span className="chapter-range">
                  01–08 关<span className="chapter-divider"> · </span>
                </span>
                <span className="chapter-count">
                  <b>{progress.completed.length} / 8</b> 完成
                </span>
              </span>
            </button>
            <button className="chapter" disabled>
              <strong>
                <Icon name="LockKeyhole" />
                阳光窗台
              </strong>
              <span>09–16 关</span>
              <small>章节筹备中</small>
            </button>
            <button className="chapter" disabled>
              <strong>
                <Icon name="LockKeyhole" />
                阁楼派对
              </strong>
              <span>17–24 关</span>
              <small>章节筹备中</small>
            </button>
          </nav>
          <section className="level-gallery" aria-label="纸箱小屋关卡">
            {LEVELS.map((item) => {
              const completed = progress.completed.includes(item.id),
                available = unlocked(progress, item.id);
              const board = progress.boards[item.id] ?? {};
              return (
                <button
                  key={item.id}
                  className={
                    "level-tile" +
                    (choice === item.id ? " selected" : "") +
                    (!available ? " locked" : "")
                  }
                  aria-label={
                    "第 " +
                    item.id +
                    " 关 " +
                    item.name +
                    (completed
                      ? "，已通关，可重玩"
                      : available
                        ? "，可游玩"
                        : "，完成上一关后解锁")
                  }
                  aria-pressed={choice === item.id}
                  aria-disabled={!available}
                  onClick={() => {
                    if (!available) {
                      setMapMessage(
                        "先完成第 " +
                          number(item.id - 1) +
                          " 关，这只纸箱就会打开。",
                      );
                      return;
                    }
                    setChoice(item.id);
                    setMapMessage("");
                  }}
                >
                  <span className="level-number">
                    {number(item.id)}
                    {completed ? (
                      <Icon name="CircleCheck" className="success-icon" />
                    ) : !available ? (
                      <Icon name="LockKeyhole" />
                    ) : null}
                  </span>
                  <div className="level-art">
                    <Thumbnail
                      level={item}
                      placements={completed ? solutions[item.id] : board}
                      locked={!available}
                    />
                  </div>
                  <span className="level-caption">
                    <span className="level-name">{item.name}</span>
                    <span className="level-state">
                      {completed
                        ? "已通关"
                        : available && Object.keys(board).length
                          ? "进行中"
                          : available
                            ? "等你来玩"
                            : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
          <footer className="map-action">
            <button className="primary" onClick={() => enter(choice, done)}>
              {done ? "重玩" : started ? "继续" : "开始"}第 {number(choice)} 关
              <Icon name="ArrowRight" />
            </button>
            <p aria-live="polite">
              {mapMessage ||
                (progress.completed.length === 8
                  ? "纸箱小屋全部通关啦！挑一箱，再陪猫猫睡个午觉。"
                  : done
                    ? "换一种摆法，再陪猫猫玩一会儿。"
                    : started
                      ? "上次摆好的猫猫还在，接着玩吧。"
                      : chosen.note)}
            </p>
          </footer>
        </>
      ) : (
        <Game
          key={level.id}
          level={level}
          board={progress.boards[level.id] ?? {}}
          onChange={(board) =>
            setProgress((p) => updateBoard(p, level.id, board))
          }
          onBack={() => {
            setChoice(level.id);
            setScreen("map");
          }}
          onNext={() => enter(level.id + 1)}
        />
      )}
      {ready && (
        <div className={"save-state " + status} role="status">
          {status === "error" ? (
            <button onClick={storage.retrySave}>进度保存失败，点击重试</button>
          ) : (
            <>
              <Icon
                name={status === "saving" ? "LoaderCircle" : "CircleCheck"}
              />
              <span>
                {status === "saving" ? "正在保存进度…" : "进度已保存"}
              </span>
            </>
          )}
        </div>
      )}
    </main>
  );
}
