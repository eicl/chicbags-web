import { useState, MouseEvent as ReactMouseEvent } from "react";

export interface IgvBarSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface IgvComparisonBarChartProps {
  xLabels: string[];
  series: IgvBarSeries[];
  height?: number;
}

const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const VIEW_WIDTH = 760;
const BAR_RADIUS = 4;
const BAR_GAP = 2;
const GROUP_PADDING_RATIO = 0.22;

const niceMax = (max: number) => {
  if (max <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

const formatSoles = (v: number) => `S/.${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatAxisTick = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

// Barra con esquinas redondeadas solo arriba (4px), ancladas a la línea
// base — mismo criterio que los data-ends redondeados del spec de marcas
// de la skill de dataviz.
const roundedTopBarPath = (x: number, y: number, w: number, h: number) => {
  if (h <= 0) return "";
  const r = Math.min(BAR_RADIUS, w / 2, h);
  if (r <= 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return `M${x},${y + r} A${r},${r} 0 0 1 ${x + r},${y} L${x + w - r},${y} A${r},${r} 0 0 1 ${x + w},${y + r} L${x + w},${y + h} L${x},${y + h} Z`;
};

// Bar chart agrupado en SVG plano (mismo criterio que SalesLineChart: sin
// librería de gráficos). Dos series por categoría (mes) — un solo eje Y
// compartido (ambas en soles), grilla recesiva, leyenda siempre visible (2
// series), barras finas con 2px de separación entre sí y tooltip por
// columna al pasar el mouse (muestra ambas series del mes a la vez, mismo
// patrón de crosshair que SalesLineChart).
const IgvComparisonBarChart = ({ xLabels, series, height = 280 }: IgvComparisonBarChartProps) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = xLabels.length;
  const plotWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;

  const maxValue = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = niceMax(maxValue || 1);
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];

  const groupWidth = n > 0 ? plotWidth / n : plotWidth;
  const groupInnerWidth = groupWidth * (1 - GROUP_PADDING_RATIO);
  const barWidth = Math.max(1, (groupInnerWidth - BAR_GAP * (series.length - 1)) / Math.max(1, series.length));
  const groupStartX = (i: number) => PAD_LEFT + i * groupWidth + (groupWidth - groupInnerWidth) / 2;
  const yAt = (v: number) => PAD_TOP + plotHeight - (v / yMax) * plotHeight;

  const handleMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = Math.floor(ratio * n);
    setHoverIndex(Math.min(n - 1, Math.max(0, index)));
  };

  const hoverXPercent = hoverIndex !== null ? ((PAD_LEFT + (hoverIndex + 0.5) * groupWidth) / VIEW_WIDTH) * 100 : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} className="w-full" style={{ overflow: "visible" }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} x2={VIEW_WIDTH - PAD_RIGHT} y1={yAt(t)} y2={yAt(t)} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
              {formatAxisTick(t)}
            </text>
          </g>
        ))}
        {xLabels.map((label, i) => (
          <text key={i} x={PAD_LEFT + (i + 0.5) * groupWidth} y={height - 8} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
            {label}
          </text>
        ))}
        {hoverIndex !== null && (
          <rect
            x={PAD_LEFT + hoverIndex * groupWidth}
            y={PAD_TOP}
            width={groupWidth}
            height={plotHeight}
            fill="hsl(var(--muted-foreground) / 0.06)"
          />
        )}
        {xLabels.map((_, i) =>
          series.map((s, si) => {
            const v = s.values[i] ?? 0;
            const barX = groupStartX(i) + si * (barWidth + BAR_GAP);
            const barY = yAt(v);
            const barH = PAD_TOP + plotHeight - barY;
            return <path key={`${s.key}-${i}`} d={roundedTopBarPath(barX, barY, barWidth, barH)} fill={s.color} />;
          })
        )}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
      {hoverIndex !== null && hoverXPercent !== null && (
        <div
          className="absolute top-2 pointer-events-none bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs z-10 whitespace-nowrap"
          style={{
            left: `${hoverXPercent}%`,
            transform: `translateX(${hoverXPercent > 80 ? "-100%" : hoverXPercent < 20 ? "0%" : "-50%"})`,
          }}
        >
          <p className="text-muted-foreground mb-1">{xLabels[hoverIndex]}</p>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-medium">{formatSoles(s.values[hoverIndex] ?? 0)}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default IgvComparisonBarChart;
