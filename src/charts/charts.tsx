import { useEffect, useRef, useState } from 'preact/hooks';
import { niceTicks } from '../stats/stats';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const M = { top: 14, right: 16, bottom: 28, left: 46 };
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmt = (n: number) => String(Number(n.toFixed(2)));

interface Tooltip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function TooltipBox({ tip, width }: { tip: Tooltip | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width - 180;
  return (
    <div class="chart-tip" role="status" style={{ left: `${tip.x}px`, top: `${tip.y}px`, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      <div class="chart-tip-title">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

export interface LinePoint {
  x: number;
  y: number;
  lines: string[];
}

interface LineProps {
  points: LinePoint[];
  unit: string;
  label: string;
  height?: number;
}

/** Single-series time chart: 2px line, 8px markers, crosshair tooltip on hover or arrow keys. */
export function LineChart({ points, unit, label, height = 220 }: LineProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const sorted = [...points].sort((a, b) => a.x - b.x);

  if (sorted.length === 0) return <div class="chart-empty muted small">No data yet.</div>;

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const ys = sorted.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const y0 = ticks[0];
  const y1 = ticks.at(-1)!;
  const x0 = sorted[0].x;
  const x1 = sorted.at(-1)!.x;
  const sx = (x: number) => M.left + (x1 === x0 ? innerW / 2 : ((x - x0) / (x1 - x0)) * innerW);
  const sy = (y: number) => M.top + innerH - ((y - y0) / (y1 - y0 || 1)) * innerH;

  const labelCount = Math.min(sorted.length, Math.max(2, Math.floor(innerW / 90)));
  const labelIdx = sorted.length === 1 ? [0] : [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round((i * (sorted.length - 1)) / (labelCount - 1))))];

  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const showMarkers = sorted.length <= 60;

  const nearest = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let best = 0;
    sorted.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(sorted[best].x) - x)) best = i;
    });
    return best;
  };

  const a = active !== null ? sorted[active] : null;
  const tip: Tooltip | null = a ? { x: sx(a.x), y: sy(a.y), title: `${shortDate(a.x)} · ${fmt(a.y)} ${unit}`, lines: a.lines } : null;

  return (
    <div class="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onMouseMove={(e) => setActive(nearest(e.clientX, (e.currentTarget as SVGElement).getBoundingClientRect()))}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((i) => Math.min(sorted.length - 1, (i ?? -1) + 1));
            else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? sorted.length) - 1));
            else return;
            e.preventDefault();
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line class="grid" x1={M.left} x2={M.left + innerW} y1={sy(t)} y2={sy(t)} />
              <text class="axis" x={M.left - 8} y={sy(t)} text-anchor="end" dominant-baseline="middle">
                {fmt(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text key={i} class="axis" x={sx(sorted[i].x)} y={height - 8} text-anchor={sorted.length === 1 ? 'middle' : i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}>
              {shortDate(sorted[i].x)}
            </text>
          ))}
          {a && <line class="crosshair" x1={sx(a.x)} x2={sx(a.x)} y1={M.top} y2={M.top + innerH} />}
          <path class="series-line" d={path} />
          {sorted.map((p, i) =>
            showMarkers || i === active ? <circle key={p.x} class={i === active ? 'series-dot active' : 'series-dot'} cx={sx(p.x)} cy={sy(p.y)} r={i === active ? 5 : 4} /> : null,
          )}
        </svg>
      )}
      <TooltipBox tip={tip} width={width} />
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  lines: string[];
}

interface BarProps {
  bars: Bar[];
  label: string;
  target?: number;
  targetLabel?: string;
  height?: number;
}

/** Single-series bars with 4px rounded tops, 2px gaps, optional dashed target line. */
export function BarChart({ bars, label, target, targetLabel, height = 200 }: BarProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  if (bars.length === 0) return <div class="chart-empty muted small">No data yet.</div>;

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const maxV = Math.max(1, target ?? 0, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, maxV, 4).filter((t) => Number.isInteger(t) || maxV > 10);
  const top = ticks.at(-1)!;
  const band = innerW / bars.length;
  const bw = Math.max(2, Math.min(36, band - 2));
  const sy = (v: number) => M.top + innerH - (v / top) * innerH;
  const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(innerW / 56)));

  const barPath = (x: number, v: number) => {
    const y = sy(v);
    const h = M.top + innerH - y;
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`;
  };

  const a = active !== null ? bars[active] : null;
  const ax = active !== null ? M.left + band * active + band / 2 : 0;
  const tip: Tooltip | null = a ? { x: ax, y: sy(a.value / 2 || 0.0001), title: a.label, lines: a.lines } : null;

  return (
    <div class="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((i) => Math.min(bars.length - 1, (i ?? -1) + 1));
            else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? bars.length) - 1));
            else return;
            e.preventDefault();
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line class="grid" x1={M.left} x2={M.left + innerW} y1={sy(t)} y2={sy(t)} />
              <text class="axis" x={M.left - 8} y={sy(t)} text-anchor="end" dominant-baseline="middle">
                {fmt(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = M.left + band * i + (band - bw) / 2;
            return (
              <g key={b.key} onMouseEnter={() => setActive(i)}>
                <rect class="hit" x={M.left + band * i} y={M.top} width={band} height={innerH} />
                <path class={i === active ? 'series-bar active' : 'series-bar'} d={barPath(x, b.value)} />
                {i % labelEvery === 0 && (
                  <text class="axis" x={M.left + band * i + band / 2} y={height - 8} text-anchor="middle">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          {target !== undefined && (
            <g>
              <line class="target" x1={M.left} x2={M.left + innerW} y1={sy(target)} y2={sy(target)} />
              <text class="axis target-label" x={M.left + innerW} y={sy(target) - 6} text-anchor="end">
                {targetLabel ?? `Target ${target}`}
              </text>
            </g>
          )}
        </svg>
      )}
      <TooltipBox tip={tip} width={width} />
    </div>
  );
}
