import type { LinearExperimentAttempt } from "./linearExperiment";
import { useEffect, useRef, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";
import {
  checkExperiment,
  rounded,
  snapParameter,
  type FunctionExperimentConfig,
} from "./richContent";
import { Formula } from "./RichLesson";

export function FunctionGraph({
  config,
  k,
  b,
}: {
  config: FunctionExperimentConfig;
  k: number;
  b: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actual = rounded(k * config.target.x + b);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth;
      if (!width) return;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      const css = getComputedStyle(canvas);
      const color = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;
      const ink = color("--muted-foreground", "#656978"),
        primary = color("--primary", "#5a56d6"),
        grid = color("--border", "#dde0e9");
      const teal = color("--learn-experiment-target", "#107c78");
      const pad = { left: 42, right: 26, top: 32, bottom: 32 };
      const xMin = Math.min(-2, config.target.x - 2),
        xMax = Math.max(5, config.target.x + 2);
      const yMin = Math.min(-1, config.target.y - 2),
        yMax = Math.max(7, config.target.y + 2);
      const x = (v: number) =>
        pad.left +
        ((v - xMin) / (xMax - xMin)) * (width - pad.left - pad.right);
      const y = (v: number) =>
        height -
        pad.bottom -
        ((v - yMin) / (yMax - yMin)) * (height - pad.top - pad.bottom);
      const line = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        stroke: string,
        weight = 1,
      ) => {
        ctx.beginPath();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = weight;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      const tick = (range: number) => {
        const raw = range / 10,
          scale = 10 ** Math.floor(Math.log10(raw));
        return [1, 2, 5, 10].find((n) => n * scale >= raw)! * scale;
      };
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      const dx = tick(xMax - xMin),
        dy = tick(yMax - yMin);
      for (let v = Math.ceil(xMin / dx) * dx; v <= xMax; v += dx) {
        line(x(v), pad.top, x(v), height - pad.bottom, grid);
        ctx.fillText(String(rounded(v)), x(v), height - 10);
      }
      ctx.textAlign = "right";
      for (let v = Math.ceil(yMin / dy) * dy; v <= yMax; v += dy) {
        line(pad.left, y(v), width - pad.right, y(v), grid);
        ctx.fillText(String(rounded(v)), pad.left - 9, y(v) + 4);
      }
      line(x(0), pad.top - 10, x(0), height - pad.bottom, ink, 1.3);
      line(pad.left, y(0), width - 10, y(0), ink, 1.3);
      ctx.fillText("y", x(0) - 8, 16);
      ctx.fillText("x", width - 4, y(0) - 8);
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        pad.left,
        pad.top,
        width - pad.left - pad.right,
        height - pad.top - pad.bottom,
      );
      ctx.clip();
      line(x(xMin), y(k * xMin + b), x(xMax), y(k * xMax + b), primary, 2.5);
      const point = (pointY: number, stroke: string, hollow: boolean) => {
        ctx.setLineDash([4, 4]);
        line(x(0), y(pointY), x(config.target.x), y(pointY), stroke);
        line(x(config.target.x), y(0), x(config.target.x), y(pointY), stroke);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(
          x(config.target.x),
          y(pointY),
          hollow ? 6 : 4.5,
          0,
          Math.PI * 2,
        );
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = hollow ? color("--card", "#fff") : stroke;
        ctx.fill();
        ctx.stroke();
      };
      point(actual, primary, false);
      point(config.target.y, teal, true);
      ctx.restore();
      ctx.textAlign = config.target.x > (xMin + xMax) / 2 ? "right" : "left";
      const labelX =
        x(config.target.x) + (ctx.textAlign === "right" ? -12 : 12);
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillStyle = teal;
      ctx.fillText(
        `目标 (${config.target.x}, ${config.target.y})`,
        labelX,
        y(config.target.y) - 14,
      );
      if (actual >= yMin && actual <= yMax) {
        ctx.fillStyle = primary;
        ctx.fillText(
          `当前 (${config.target.x}, ${actual})`,
          labelX,
          Math.min(height - pad.bottom - 8, y(actual) + 23),
        );
      }
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    const theme = new MutationObserver(draw);
    const app = canvas.closest(".learning-app");
    if (app)
      theme.observe(app, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [config, k, b, actual]);
  return (
    <canvas
      ref={canvasRef}
      className="learn-function-graph"
      role="img"
      aria-label={`函数 y = ${k}x + ${b} 的图像。目标点 (${config.target.x}, ${config.target.y})，当前点 (${config.target.x}, ${actual})。`}
    />
  );
}

export function FunctionExperiment({
  config,
  attempt,
  onCheck,
  preview = false,
  disabled = false,
  onAsk,
}: {
  config: FunctionExperimentConfig;
  attempt?: LinearExperimentAttempt;
  onCheck?: (attempt: LinearExperimentAttempt) => Promise<void>;
  preview?: boolean;
  disabled?: boolean;
  onAsk?: (prompt: string) => void;
}) {
  const [values, setValues] = useState({
    k: attempt?.k ?? config.parameters.k.initial,
    b: attempt?.b ?? config.parameters.b.initial,
  });
  const [checked, setChecked] = useState(!!attempt);
  const [hint, setHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const result = checkExperiment(config, values);
  const setParameter = (key: "k" | "b", value: number) => {
    setValues((old) => ({
      ...old,
      [key]: snapParameter(value, config.parameters[key]),
    }));
    setChecked(false);
    setError("");
  };
  const busy = disabled || saving;
  return (
    <section
      className={`learn-experiment ${preview ? "is-preview" : ""}`}
      aria-label={preview ? "实验试跑" : "函数图像实验"}
    >
      <div className="learn-experiment-heading">
        <div>
          <h2>挑战：{config.task}</h2>
          <p>调整 k 和 b，观察图像，再检查你的结果。</p>
        </div>
        <div className="learn-current-equation">
          <small>当前</small>
          <Formula
            latex={`y = ${values.k}x ${values.b < 0 ? "-" : "+"} ${Math.abs(values.b)}`}
          />
        </div>
      </div>
      <FunctionGraph config={config} {...values} />
      <fieldset className="learn-parameter-controls" disabled={busy}>
        <legend className="sr-only">调整函数参数</legend>
        {(["k", "b"] as const).map((key) => (
          <div className="learn-parameter-control" key={key}>
            <label htmlFor={`${preview ? "preview" : "study"}-${key}`}>
              {key === "k" ? "斜率 k" : "截距 b"}
            </label>
            <output>{values[key]}</output>
            <input
              id={`${preview ? "preview" : "study"}-${key}`}
              type="range"
              min={config.parameters[key].min}
              max={config.parameters[key].max}
              step={config.parameters[key].step}
              value={values[key]}
              onChange={(e) => setParameter(key, Number(e.target.value))}
            />
            <div className="learn-range-ends">
              <span>{config.parameters[key].min}</span>
              <span>{config.parameters[key].max}</span>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="learn-experiment-footer">
        <div>
          <p>
            x = {config.target.x} 时，y = {values.k} × {config.target.x} + (
            {values.b}) = <strong>{result.actual}</strong>
          </p>
          <small>
            目标 y = {config.target.y} · 允许误差 {config.target.tolerance}
          </small>
        </div>
        <div className="learn-experiment-actions">
          <button
            type="button"
            className="learn-button"
            disabled={busy}
            onClick={() => {
              setValues({
                k: config.parameters.k.initial,
                b: config.parameters.b.initial,
              });
              setChecked(false);
              setHint(false);
              setError("");
            }}
          >
            <RotateCcw size={14} />
            重置
          </button>
          <button
            type="button"
            className="learn-button primary"
            disabled={busy}
            onClick={async () => {
              if (savingRef.current) return;
              savingRef.current = true;
              setSaving(true);
              setError("");
              try {
                await onCheck?.({ ...values, checkedAt: Date.now() });
                setChecked(true);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "保存实验记录失败，请重试",
                );
              } finally {
                savingRef.current = false;
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "检查结果"}
          </button>
        </div>
      </div>
      {error && (
        <p className="learn-field-error" role="alert">
          {error}
        </p>
      )}
      {checked && (
        <div
          className={`learn-experiment-result ${result.passed ? "passed" : "retry"}`}
          role="status"
        >
          <strong>{result.passed ? "挑战完成" : "再调整一下"}</strong>
          <p>
            {result.passed
              ? config.successMessage ||
                "直线已经经过目标点。试着找一组不同的解。"
              : `当前 y = ${result.actual}，与目标相差 ${result.distance}。你可以先固定一个参数再调整。`}
          </p>
        </div>
      )}
      <div className="learn-experiment-help">
        {config.hint && (
          <button
            type="button"
            className="learn-button text compact"
            aria-expanded={hint}
            onClick={() => setHint(!hint)}
          >
            <Lightbulb size={15} />
            {hint ? "收起提示" : "给我一点提示"}
          </button>
        )}
        {onAsk && (
          <button
            type="button"
            className="learn-button text compact"
            onClick={() =>
              onAsk(
                `我在做实验：${config.task}。当前 k=${values.k}，b=${values.b}，x=${config.target.x} 时 y=${result.actual}，目标 y=${config.target.y}。请根据这些数据引导我思考，先给提示，不要直接给出答案。`,
              )
            }
          >
            请导师帮我分析
          </button>
        )}
      </div>
      {hint && <p className="learn-experiment-hint">{config.hint}</p>}
      {preview && <small className="learn-muted">试跑不会计入学习记录。</small>}
    </section>
  );
}
