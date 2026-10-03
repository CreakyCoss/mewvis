import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  bounds,
  canPlace,
  hint,
  isSolved,
  place,
  shape,
  type Hint,
  type Level,
  type Piece,
  type Placements,
  type Pose,
} from "./engine";
import { LEVELS } from "./levels";
import { CatArt, Icon, Paper, silhouette, Thumbnail } from "./visuals";

type Drag = {
  id: string;
  rotation: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
  pointer: number;
};
type Preview = { id: string; pose: Pose };

export function Game({
  level,
  board,
  onChange,
  onBack,
  onNext,
}: {
  level: Level;
  board: Placements;
  onChange(board: Placements): void;
  onBack(): void;
  onNext(): void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPoint, setDragPoint] = useState<[number, number] | null>(null);
  const [tip, setTip] = useState<Hint | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Placements[]>([]);
  const [dialog, setDialog] = useState<"reset" | "help" | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const solved = isSolved(level, board);
  const remaining = level.pieces.filter((p) => !board[p.id]);
  const currentPiece = level.pieces.find((p) => p.id === selected);
  const next = LEVELS[level.id];
  const angle = (id: string) => rotations[id] ?? board[id]?.rotation ?? 0;
  useEffect(() => {
    if (dialog && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, [dialog]);
  useEffect(() => {
    if (solved) {
      setSelected(null);
      setPreview(null);
      setTip(null);
    }
  }, [solved]);
  function commit(value: Placements) {
    setHistory((h) => [...h.slice(-39), board]);
    onChange(value);
    setTip(null);
    setPreview(null);
    setSelected(null);
    setMessage("");
  }
  function put(id: string, pose: Pose) {
    const value = place(level, board, id, pose);
    if (value) {
      commit(value);
      setRotations((r) => ({ ...r, [id]: pose.rotation }));
    } else {
      setMessage("这里有点挤，换个位置试试。");
      setPreview(null);
    }
  }
  function remove(id: string) {
    const value = { ...board };
    delete value[id];
    commit(value);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    onChange(previous);
    setTip(null);
    setPreview(null);
    setSelected(null);
    setMessage("已撤销上一步。");
  }
  function rotate(id: string) {
    const rotation = (angle(id) + 1) % 4;
    if (board[id]) {
      const pose = { ...board[id], rotation };
      if (canPlace(level, board, id, pose)) {
        commit({ ...board, [id]: pose });
        setSelected(id);
      } else {
        setMessage("转身有点挤，先放回待安置区再转吧。");
        return;
      }
    }
    setRotations((r) => ({ ...r, [id]: rotation }));
    setTip(null);
    setPreview((p) =>
      p?.id === id ? { id, pose: { ...p.pose, rotation } } : null,
    );
  }
  function select(id: string) {
    setSelected(id);
    setTip(null);
    setPreview(null);
    setMessage("选好了。可以拖动，也可以点击空格放入。");
  }
  function point(
    clientX: number,
    clientY: number,
    id: string,
    rotation: number,
    offsetX = 0,
    offsetY = 0,
  ): Pose | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (
      !rect ||
      clientX < rect.left ||
      clientY < rect.top ||
      clientX > rect.right ||
      clientY > rect.bottom
    )
      return null;
    return {
      x:
        Math.floor(((clientX - rect.left) / rect.width) * level.cols) - offsetX,
      y:
        Math.floor(((clientY - rect.top) / rect.height) * level.rows) - offsetY,
      rotation,
    };
  }
  function startDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    piece: Piece,
  ) {
    if (solved || event.button !== 0 || dialog) return;
    event.stopPropagation();
    const rotation = angle(piece.id),
      size = bounds(shape(piece.kind, rotation));
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = Math.min(
      size.width - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * size.width),
    );
    const offsetY = Math.min(
      size.height - 1,
      Math.floor(((event.clientY - rect.top) / rect.height) * size.height),
    );
    drag.current = {
      id: piece.id,
      rotation,
      offsetX,
      offsetY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointer: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: ReactPointerEvent) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (
      !active.moved &&
      Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <
        5
    )
      return;
    active.moved = true;
    setDragging(true);
    setDragPoint([event.clientX, event.clientY]);
    setSelected(active.id);
    setTip(null);
    const pose = point(
      event.clientX,
      event.clientY,
      active.id,
      active.rotation,
      active.offsetX,
      active.offsetY,
    );
    setPreview(pose ? { id: active.id, pose } : null);
  }
  function endDrag(event: ReactPointerEvent) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (!active.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const pose = point(
      event.clientX,
      event.clientY,
      active.id,
      active.rotation,
      active.offsetX,
      active.offsetY,
    );
    if (pose) put(active.id, pose);
    else {
      setPreview(null);
      setMessage("猫猫还在原来的位置，拖进纸箱再松手吧。");
    }
  }
  function cancelDrag() {
    drag.current = null;
    setDragging(false);
    setPreview(null);
  }
  function showHint() {
    const value = hint(level, board, selected ?? undefined);
    setTip(value);
    if (value.kind === "place") {
      setSelected(value.id);
      setRotations((r) => ({ ...r, [value.id]: value.pose.rotation }));
      setPreview({ id: value.id, pose: value.pose });
      const name = level.pieces.find((p) => p.id === value.id)!.name;
      setMessage("试着把" + name + "放在发光的位置。");
    } else if (value.kind === "remove") {
      setSelected(value.id);
      setPreview(null);
      setMessage(
        "把" +
          level.pieces.find((p) => p.id === value.id)!.name +
          "先放回去，其他猫猫就有地方啦。",
      );
    } else
      setMessage(
        value.kind === "done"
          ? "猫猫已经全部安顿好啦。"
          : "换只猫试一试，再让我想想。",
      );
  }
  function onKey(event: ReactKeyboardEvent) {
    if (dialog || solved || drag.current) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (!selected || !currentPiece) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSelected(null);
      setPreview(null);
      setTip(null);
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      rotate(selected);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (board[selected]) remove(selected);
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const rotation = angle(selected),
        size = bounds(shape(currentPiece.kind, rotation));
      const pose =
        preview?.id === selected
          ? preview.pose
          : (board[selected] ?? { x: 0, y: 0, rotation });
      setPreview({
        id: selected,
        pose: {
          x: Math.max(
            0,
            Math.min(
              level.cols - size.width,
              pose.x +
                (event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              level.rows - size.height,
              pose.y +
                (event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowUp"
                    ? -1
                    : 0),
            ),
          ),
          rotation,
        },
      });
    }
    if (event.key === "Enter" && preview && preview.id === selected) {
      event.preventDefault();
      put(selected, preview.pose);
    }
  }
  const ghost = preview && level.pieces.find((p) => p.id === preview.id);
  const ghostCells =
    ghost && preview
      ? shape(ghost.kind, preview.pose.rotation).map(([x, y]) => [
          x + preview.pose.x,
          y + preview.pose.y,
        ])
      : [];
  const validGhost = preview
    ? canPlace(level, board, preview.id, preview.pose)
    : false;
  function renderPiece(piece: Piece, inBoard: boolean) {
    const rotation = inBoard ? board[piece.id].rotation : angle(piece.id);
    const size = bounds(shape(piece.kind, rotation)),
      pose = board[piece.id];
    const style = inBoard
      ? {
          width: (size.width / level.cols) * 100 + "%",
          height: (size.height / level.rows) * 100 + "%",
          left: (pose.x / level.cols) * 100 + "%",
          top: (pose.y / level.rows) * 100 + "%",
        }
      : {
          width: "min(100%, calc(var(--tray-unit) * " + size.width + "))",
          aspectRatio: size.width + " / " + size.height,
        };
    return (
      <button
        key={piece.id}
        className={
          "piece" +
          (inBoard ? " placed" : "") +
          (selected === piece.id ? " picked" : "") +
          (dragging && selected === piece.id ? " dragging" : "")
        }
        style={{ ...style, clipPath: silhouette(shape(piece.kind, rotation)) }}
        data-piece={piece.id}
        aria-label={
          piece.name +
          (inBoard ? "，已放入纸箱" : "，待安置") +
          "，方向 " +
          rotation * 90 +
          " 度"
        }
        aria-pressed={selected === piece.id}
        disabled={solved}
        onPointerDown={(e) => startDrag(e, piece)}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClick.current || solved) return;
          if (selected === piece.id) rotate(piece.id);
          else select(piece.id);
        }}
      >
        <CatArt kind={piece.kind} rotation={rotation} />
      </button>
    );
  }
  return (
    <section
      className="game"
      aria-label={"第 " + level.id + " 关 " + level.name}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={() => {
        if (drag.current) cancelDrag();
      }}
      onKeyDown={onKey}
    >
      <div className="game-toolbar">
        <button className="quiet" onClick={onBack}>
          <Icon name="Grid2X2" />
          关卡地图
        </button>
        <div className="level-heading">
          <h2>
            第 {String(level.id).padStart(2, "0")} 关 · {level.name}
          </h2>
          <p>
            {level.cols} × {level.rows} 格 · {level.pieces.length} 只猫
          </p>
        </div>
        <div className="game-tools">
          {solved ? (
            <button
              className="quiet"
              onClick={() => {
                setHistory([]);
                onChange({});
                setRotations({});
              }}
            >
              <Icon name="RotateCcw" />
              再玩本关
            </button>
          ) : (
            <>
              <button
                className="quiet"
                disabled={!history.length}
                onClick={undo}
              >
                <Icon name="Undo2" />
                撤销
              </button>
              <button
                className="quiet"
                disabled={!Object.keys(board).length}
                onClick={() => setDialog("reset")}
              >
                <Icon name="RotateCcw" />
                重来
              </button>
            </>
          )}
        </div>
      </div>
      <div className="play-layout">
        <div className="board-column">
          <Paper
            className={"main-board" + (solved ? " complete-board" : "")}
            style={
              { "--cols": level.cols, "--rows": level.rows } as CSSProperties
            }
          >
            <div
              ref={boardRef}
              className="board-grid"
              style={{ aspectRatio: level.cols + " / " + level.rows }}
              aria-label="纸箱棋盘"
              onMouseMove={(e) => {
                if (selected && !drag.current && !tip) {
                  const pose = point(
                    e.clientX,
                    e.clientY,
                    selected,
                    angle(selected),
                  );
                  setPreview(pose ? { id: selected, pose } : null);
                }
              }}
              onMouseLeave={() => {
                if (!drag.current && !tip) setPreview(null);
              }}
            >
              {Array.from({ length: level.cols * level.rows }, (_, i) => {
                const x = i % level.cols,
                  y = Math.floor(i / level.cols),
                  glow = ghostCells.some(([gx, gy]) => gx === x && gy === y);
                return (
                  <button
                    key={i}
                    className={
                      "board-cell" +
                      (glow ? (validGhost ? " can-drop" : " cannot-drop") : "")
                    }
                    style={{
                      width: 100 / level.cols + "%",
                      height: 100 / level.rows + "%",
                      left: (x / level.cols) * 100 + "%",
                      top: (y / level.rows) * 100 + "%",
                    }}
                    aria-label={"第 " + (y + 1) + " 行第 " + (x + 1) + " 列"}
                    data-cell={x + "," + y}
                    tabIndex={selected ? 0 : -1}
                    disabled={solved}
                    onClick={() => {
                      if (selected && !suppressClick.current)
                        put(selected, { x, y, rotation: angle(selected) });
                    }}
                  />
                );
              })}
              {level.pieces
                .filter((p) => board[p.id])
                .map((p) => renderPiece(p, true))}
            </div>
          </Paper>
          {!solved && (
            <div className="board-help">
              <span>
                <Icon name="MousePointer2" />
                拖动放入 · 选中后可旋转
              </span>
              <button onClick={() => setDialog("help")}>
                <Icon name="HelpCircle" />
                怎么玩
              </button>
            </div>
          )}
        </div>
        <aside className={"cat-side" + (solved ? " success-side" : "")}>
          {solved ? (
            <>
              <div className="success-kicker">
                <Icon name="CircleCheck" />第{" "}
                {String(level.id).padStart(2, "0")} 关完成
              </div>
              <h3>{next ? "一箱猫猫，整整齐齐。" : "纸箱小屋，全部通关！"}</h3>
              <p className="success-copy">
                {next
                  ? level.pieces.length + " 只猫都找到舒服的位置啦。"
                  : "八箱小幸福，谢谢你安顿了每一只猫。"}
              </p>
              {next ? (
                <div className="next-preview">
                  <h4>下一站</h4>
                  <div>
                    <Thumbnail level={next} placements={{}} />
                    <section>
                      <strong>
                        第 {String(next.id).padStart(2, "0")} 关 · {next.name}
                      </strong>
                      <p>
                        {next.cols} × {next.rows} 格 · 多一点小挑战
                      </p>
                      <span>
                        <Icon name="CircleCheck" />
                        已解锁
                      </span>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="chapter-finish">
                  <Icon name="CircleCheck" />
                  <p>8 / 8 关已完成</p>
                  <span>其他主题小屋正在筹备，已完成的关卡随时可以重玩。</span>
                </div>
              )}
              <button
                className="primary next-button"
                onClick={next ? onNext : onBack}
              >
                {next ? "下一关" : "回到关卡地图"}
                <Icon name="ArrowRight" />
              </button>
              {next && (
                <button className="text-button" onClick={onBack}>
                  返回关卡地图
                </button>
              )}
            </>
          ) : (
            <>
              <h3>
                {remaining.length === level.pieces.length
                  ? "给每只猫，找个好位置。"
                  : remaining.length === 1
                    ? "最后一只，刚刚好。"
                    : remaining.length === 2
                      ? "还差两只，就挤下啦。"
                      : "还差" + remaining.length + "只，就挤下啦。"}
              </h3>
              <span className="placed-count">
                已安置 {level.pieces.length - remaining.length} /{" "}
                {level.pieces.length}
              </span>
              <div
                className={
                  "cat-tray" +
                  (remaining.length <= 2
                    ? " last-cats"
                    : remaining.length === 3
                      ? " few-cats"
                      : "")
                }
                aria-label="待安置的猫猫"
              >
                {remaining.map((p) => (
                  <div className="tray-item" key={p.id}>
                    {renderPiece(p, false)}
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
              <div className="selection-tools">
                <button
                  className="quiet"
                  disabled={!currentPiece}
                  onClick={() => selected && rotate(selected)}
                >
                  <Icon name="RotateCw" />
                  旋转{currentPiece ? " · " + currentPiece.name : ""}
                </button>
                <button
                  className="quiet"
                  disabled={!selected || !board[selected]}
                  onClick={() => selected && remove(selected)}
                >
                  放回待安置区
                </button>
              </div>
              <div className="hint-area">
                <p
                  className={tip ? "hint-message" : "game-message"}
                  role="status"
                >
                  {message ||
                    (level.id === 1 ? level.note : "没有倒计时，慢慢摆就好。")}
                </p>
                {tip?.kind === "place" && (
                  <button
                    className="text-button hint-apply"
                    onClick={() => put(tip.id, tip.pose)}
                  >
                    帮我放好这只
                    <Icon name="ArrowRight" />
                  </button>
                )}
                {tip?.kind === "remove" && (
                  <button
                    className="text-button hint-apply"
                    onClick={() => remove(tip.id)}
                  >
                    先把这只放回去
                    <Icon name="Undo2" />
                  </button>
                )}
                <button className="primary hint-button" onClick={showHint}>
                  <Icon name="Lightbulb" />
                  给点提示
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
      {dragging &&
        drag.current &&
        dragPoint &&
        currentPiece &&
        (() => {
          const active = drag.current,
            cells = shape(currentPiece.kind, active.rotation),
            size = bounds(cells);
          const unit =
            (boardRef.current?.getBoundingClientRect().width ?? 400) /
            level.cols;
          return (
            <div
              className="drag-visual"
              style={{
                left: dragPoint[0] - (active.offsetX + 0.5) * unit,
                top: dragPoint[1] - (active.offsetY + 0.5) * unit,
                width: size.width * unit,
                height: size.height * unit,
                clipPath: silhouette(cells),
              }}
            >
              <CatArt kind={currentPiece.kind} rotation={active.rotation} />
            </div>
          );
        })()}
      {dialog && (
        <dialog
          ref={dialogRef}
          className="game-dialog"
          onClose={() => setDialog(null)}
        >
          <button
            className="dialog-close"
            aria-label="关闭"
            onClick={() => dialogRef.current?.close()}
          >
            <Icon name="X" />
          </button>
          <h2>
            {dialog === "reset" ? "重新整理这一箱？" : "一起把猫猫安顿好"}
          </h2>
          {dialog === "reset" ? (
            <>
              <p>本关的摆放会清空，已完成的关卡记录会保留。</p>
              <div className="dialog-actions">
                <button
                  className="quiet"
                  autoFocus
                  onClick={() => dialogRef.current?.close()}
                >
                  继续摆
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    commit({});
                    setRotations({});
                    dialogRef.current?.close();
                  }}
                >
                  重新开始
                </button>
              </div>
            </>
          ) : (
            <>
              <ol>
                <li>拖动猫猫放进纸箱，也可以先选猫，再点击空格。</li>
                <li>再次点击选中的猫或点「旋转」，让它转个身。</li>
                <li>不能重叠、越界。摆满纸箱就能解锁下一关。</li>
                <li>卡住时点「给点提示」，随时可以撤销或重来。</li>
              </ol>
              <p className="keyboard-help">
                键盘也能玩：Tab 选猫，方向键移动预览，R 旋转，Enter 放入，Esc
                取消，Delete 放回。
              </p>
              <button
                className="primary"
                autoFocus
                onClick={() => dialogRef.current?.close()}
              >
                知道啦
              </button>
            </>
          )}
        </dialog>
      )}
    </section>
  );
}
