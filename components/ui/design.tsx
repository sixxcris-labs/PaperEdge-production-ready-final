/**
 * Lightweight design-system primitives — all pure HTML/CSS, no deps.
 * These map directly to the CSS classes in globals.css.
 */
import { statusBadge, sportInfo } from "@paperedge/core/fmt";

/** Status badge */
export function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusBadge(status);
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

/** Sport pill */
export function SportPill({ sport }: { sport: string }) {
  const { cls, label } = sportInfo(sport);
  return (
    <span className="sport">
      <span className={`d ${cls}`} />
      {label}
    </span>
  );
}

/** Sportsbook avatar + name row */
const BOOKS: Record<string, { cls: string; initials: string; name: string }> = {
  "4cx": { cls: "other", initials: "4C", name: "4CX" },
  bovada: { cls: "bovada", initials: "BV", name: "Bovada" },
  "crypto.com sports event trading": { cls: "other", initials: "CR", name: "Crypto.com Sports Event Trading" },
  "draftkings predictions": { cls: "other", initials: "DP", name: "DraftKings Predictions" },
  "fanatics markets": { cls: "other", initials: "FM", name: "Fanatics Markets" },
  fliff: { cls: "fliff", initials: "FL", name: "Fliff" },
  kalshi: { cls: "kalshi", initials: "KL", name: "Kalshi" },
  novi: { cls: "other", initials: "NO", name: "Novi" },
  novig: { cls: "novig", initials: "NV", name: "Novig" },
  "onyx odds": { cls: "other", initials: "OO", name: "Onyx Odds" },
  polymarket: { cls: "other", initials: "PM", name: "Polymarket" },
  "prophet x": { cls: "prophetx", initials: "PX", name: "Prophet X" },
  sportzino: { cls: "sportzino", initials: "SZ", name: "Sportzino" },
  betopenly: { cls: "other", initials: "BO", name: "BetOpenly" },
  betr: { cls: "other", initials: "BT", name: "Betr" },
  courtside: { cls: "other", initials: "CS", name: "Courtside" },
  "dogg house": { cls: "other", initials: "DH", name: "Dogg House" },
  other: { cls: "other", initials: "··", name: "Other" },
};

export function bookInfo(id: string) {
  return BOOKS[id?.toLowerCase()] ?? { cls: "other", initials: id?.slice(0,2).toUpperCase() ?? "?", name: id ?? "Other" };
}

export function BookCell({ name }: { name: string }) {
  const b = bookInfo(name);
  return (
    <span className="book-row">
      <span className={`book-av ${b.cls}`}>{b.initials}</span>
      {b.name}
    </span>
  );
}

/** KPI card */
export function KPI({
  label,
  value,
  delta,
  sub,
  up,
  down,
  warn,
}: {
  label: string;
  value: string | number;
  delta?: string;
  sub?: string;
  up?: boolean;
  down?: boolean;
  warn?: boolean;
}) {
  const cls = up ? "up" : down ? "down" : "flat";
  const valStr = String(value);
  return (
    <div className="card kpi">
      <div className="label">
        {label}
        {warn && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
          </svg>
        )}
      </div>
      <div className={`val ${valStr.length > 9 ? "sm" : ""} ${up ? "pos" : down ? "neg" : ""}`}>
        {value}
      </div>
      <div className="foot">
        {delta && <span className={`delta ${cls}`}>{up && "▲ "}{down && "▼ "}{delta}</span>}
        {sub && !delta && <span className="hint dim">{sub}</span>}
      </div>
    </div>
  );
}

/** Inline sparkline SVG */
export function Sparkline({
  data,
  color = "#22C55E",
  width = 80,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const ys = data;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const X = (i: number) => (i / Math.max(ys.length - 1, 1)) * width;
  const Y = (v: number) =>
    height - ((v - minY) / (maxY - minY || 1)) * (height - 3) - 1.5;
  const path = ys.map((y, i) => `${i === 0 ? "M" : "L"} ${X(i)} ${Y(y)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

/** Line chart */
export function LineChart({
  data,
  height = 220,
  color = "#22C55E",
}: {
  data: { v: number; d?: number | string }[];
  height?: number;
  color?: string;
}) {
  const w = 760, h = height, pad = { l: 36, r: 12, t: 14, b: 22 };
  const ys = data.map((d) => d.v);
  const minY = Math.min(...ys) * 0.998;
  const maxY = Math.max(...ys) * 1.002;
  const X = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * (h - pad.t - pad.b);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${X(i)} ${Y(d.v)}`).join(" ");
  const areaPath = `${path} L ${X(data.length - 1)} ${h - pad.b} L ${X(0)} ${h - pad.b} Z`;
  const grid = 4;
  const yTicks = Array.from({ length: grid + 1 }, (_, i) => minY + ((maxY - minY) * i) / grid);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lc-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.05)" />
          <text x={pad.l - 6} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#5A6377" fontFamily="IBM Plex Mono">
            ${t.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="url(#lc-area)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" />
      {data.map((d, i) =>
        (i % 5 === 0 || i === data.length - 1) ? (
          <circle key={i} cx={X(i)} cy={Y(d.v)} r="2.4" fill={color} />
        ) : null
      )}
      {data.map((d, i) =>
        (i % 6 === 0 || i === data.length - 1) ? (
          <text key={`x${i}`} x={X(i)} y={h - 6} fontSize="9" textAnchor="middle" fill="#5A6377" fontFamily="IBM Plex Mono">
            D{i + 1}
          </text>
        ) : null
      )}
    </svg>
  );
}

/** Grouped bar chart */
export function GroupedBarChart({
  data,
  height = 220,
}: {
  data: { d: string; expected: number; actual: number }[];
  height?: number;
}) {
  const w = 760, h = height, pad = { l: 38, r: 12, t: 14, b: 26 };
  const allVals = data.flatMap((d) => [d.expected, d.actual]);
  const minY = Math.min(0, ...allVals) * 1.1;
  const maxY = Math.max(...allVals) * 1.15;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const groupW = innerW / data.length;
  const barW = (groupW - 6) / 2;
  const Y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * innerH;
  const yZero = Y(0);
  const grid = 4;
  const yTicks = Array.from({ length: grid + 1 }, (_, i) => minY + ((maxY - minY) * i) / grid);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.05)" />
          <text x={pad.l - 6} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#5A6377" fontFamily="IBM Plex Mono">
            ${t.toFixed(0)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={w - pad.r} y1={yZero} y2={yZero} stroke="rgba(255,255,255,0.18)" />
      {data.map((d, i) => {
        const x0 = pad.l + groupW * i + 3;
        const renderBar = (v: number, ki: number, color: string, opacity: number) => {
          const x = x0 + ki * barW;
          const y = Math.min(Y(v), yZero);
          const hh = Math.abs(Y(v) - yZero);
          const fill = v < 0 ? "#EF4444" : color;
          return <rect key={ki} x={x} y={y} width={barW - 2} height={Math.max(2, hh)} rx="2" fill={fill} opacity={opacity} />;
        };
        return (
          <g key={i}>
            {renderBar(d.expected, 0, "#3B82F6", 0.6)}
            {renderBar(d.actual, 1, "#22C55E", 0.95)}
            <text x={pad.l + groupW * i + groupW / 2} y={h - 8} fontSize="9" textAnchor="middle" fill="#5A6377" fontFamily="IBM Plex Mono">
              {d.d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Simple bar chart */
export function BarChart({
  data,
  height = 200,
  color = "#3B82F6",
}: {
  data: { m: string; v: number }[];
  height?: number;
  color?: string;
}) {
  const w = 760, h = height, pad = { l: 50, r: 12, t: 14, b: 26 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const minY = Math.min(0, ...data.map((d) => d.v)) * 1.1;
  const maxY = Math.max(...data.map((d) => d.v)) * 1.15;
  const Y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * innerH;
  const yZero = Y(0);
  const barW = innerW / data.length - 12;
  const grid = 4;
  const yTicks = Array.from({ length: grid + 1 }, (_, i) => minY + ((maxY - minY) * i) / grid);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.05)" />
          <text x={pad.l - 6} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#5A6377" fontFamily="IBM Plex Mono">
            ${t.toFixed(0)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={w - pad.r} y1={yZero} y2={yZero} stroke="rgba(255,255,255,0.18)" />
      {data.map((d, i) => {
        const x = pad.l + (innerW / data.length) * i + 6;
        const y = Math.min(Y(d.v), yZero);
        const hh = Math.abs(Y(d.v) - yZero);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(2, hh)} rx="3" fill={d.v < 0 ? "#EF4444" : color} />
            <text x={x + barW / 2} y={h - 8} fontSize="9.5" textAnchor="middle" fill="#8A93A7" fontFamily="IBM Plex Mono">
              {d.m}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
