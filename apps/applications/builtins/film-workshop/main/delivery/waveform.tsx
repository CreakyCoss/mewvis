import { useEffect, useRef, useState } from "react";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { getApplicationMediaClient } from "@mewvis/app-sdk/media";

type Wave = { peaks: number[]; duration: number };
const cache = new Map<string, Promise<Wave>>();
// Keep decoded buffers out of the cache and bound concurrent reads/decodes.
let decoding = Promise.resolve();
function loadWave(filePath: string, revision: string) {
  const key = `${filePath}:${revision}`;
  let result = cache.get(key);
  if (!result) {
    result = decoding.then(async () => {
      const info = await getApplicationMediaClient().probe(filePath);
      if (
        !info.duration ||
        info.duration > 600 ||
        !info.audio ||
        info.audio.channels > 2 ||
        info.size > 8 * 1048576
      )
        throw new Error("此素材暂不显示波形");
      const bytes = await getApplicationFileClient().readBinary(filePath, {
        maxBytes: 8 * 1048576,
      });
      const context = new OfflineAudioContext(1, 1, 8000);
      const buffer = await context.decodeAudioData(
        bytes.slice().buffer as ArrayBuffer,
      );
      const peaks = Array.from({ length: 240 }, () => 0);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
          const bin = Math.min(239, Math.floor((i * 240) / data.length));
          peaks[bin] = Math.max(peaks[bin], Math.abs(data[i]));
        }
      }
      return { peaks, duration: buffer.duration };
    });
    decoding = result.then(
      () => {},
      () => {},
    );
    cache.set(key, result);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return result;
}

/** A visualization of actual decoded samples; silence remains flat. */
export function Waveform({
  filePath,
  revision,
  duration,
}: {
  filePath: string;
  revision: string;
  duration: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<Wave>();
  const [state, setState] = useState("加载波形…");
  useEffect(() => {
    let active = true;
    setWave(undefined);
    setState("加载波形…");
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void loadWave(filePath, revision).then(
        (value) => {
          if (active) {
            setWave(value);
            setState("");
          }
        },
        () => {
          if (active) setState("波形不可用");
        },
      );
    });
    if (canvas.current) observer.observe(canvas.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [filePath, revision]);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !wave) return;
    const draw = () => {
      const width = node.clientWidth,
        height = node.clientHeight;
      const scale = window.devicePixelRatio || 1;
      node.width = Math.round(width * scale);
      node.height = Math.round(height * scale);
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.strokeStyle = getComputedStyle(node).color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      const maximum = Math.max(...wave.peaks, 0.01);
      for (let x = 0; x < width; x += 3) {
        const source = ((x / width) * duration) / wave.duration;
        if (source >= 1) break;
        const peak = wave.peaks[Math.floor(source * wave.peaks.length)] ?? 0;
        const amplitude = (peak / maximum) * (height / 2 - 2);
        ctx.beginPath();
        ctx.moveTo(x, height / 2 - amplitude);
        ctx.lineTo(x, height / 2 + amplitude);
        ctx.stroke();
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    draw();
    return () => observer.disconnect();
  }, [wave, duration]);
  return (
    <div className="film-timeline-wave">
      <canvas ref={canvas} aria-label={wave ? "配音波形" : state} />
      {state && <small>{state}</small>}
    </div>
  );
}
