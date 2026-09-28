import { useState } from "react";

/** Fixed, local active-recall widget. Course text is never evaluated as markup. */
export function RecallCards({ points }: { points: string[] }) {
  const [revealed, setRevealed] = useState<number[]>([]);
  return (
    <section className="learn-recall" aria-label="知识要点自测">
      <div className="learn-section-title">
        <div>
          <span className="learn-eyebrow">ACTIVE RECALL</span>
          <h2>遮住答案，自己解释</h2>
        </div>
        <span className="learn-chip">
          {revealed.length} / {points.length} 已核对
        </span>
      </div>
      <p className="learn-muted">先说出你记得的要点，再逐张翻开核对。</p>
      <div className="learn-recall-grid">
        {points.map((point, index) => {
          const open = revealed.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`learn-recall-card ${open ? "revealed" : ""}`}
              aria-expanded={open}
              onClick={() =>
                setRevealed((current) =>
                  current.includes(index)
                    ? current.filter((value) => value !== index)
                    : [...current, index],
                )
              }
            >
              <strong>要点 {index + 1}</strong>
              <span>{open ? point : "先用自己的话解释，再点击查看"}</span>
              <small>{open ? "点击重新遮住" : "点击核对"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
