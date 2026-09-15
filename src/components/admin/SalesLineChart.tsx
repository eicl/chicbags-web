import { useState, MouseEvent as ReactMouseEvent } from "react";

export interface SalesLineChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface SalesLineChartProps {
  xLabels: string[];
  xTooltipLabels?: string[];
  series: SalesLineChartSeries[];
  height?: number;
}

const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const VIEW_WIDTH = 760;

// Redondea el techo del eje Y a un número "limpio" (1/2/5 x potencia de 10)
// — evita ticks como "1,847".
const niceMax = (max: number) => {
  if (max <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

const formatSoles = (v: number) => `S/.${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatAxisTick = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

// Line chart en SVG plano (sin librería de gráficos): 1 a pocas series,
// pensado para tendencias temporales de ventas. Sigue el spec de marcas de
// la skill de dataviz — línea 2px, marcador de punta ≥8px con anillo de
// superficie, grilla horizontal recesiva, leyenda solo si hay 2+ series, y
// un tooltip con crosshair que muestra todas las series a la vez.
const SalesLineChart = ({ xLabels, xTooltipLabels, series, height = 260 }: SalesLineChartProps) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = xLabels.length;
  const plotWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;

  const maxValue = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = niceMax(maxValue || 1);
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];

  const xAt = (i: number) => PAD_LEFT + (n <= 1 ? plotWidth / 2 : (plotWidth * i) / (n - 1));
  const yAt = (v: number) => PAD_TOP + plotHeight - (v / yMax) * plotHeight;
  const pathFor = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ");

  // Cuántas etiquetas del eje X mostrar sin que se amontonen (siempre se
  // muestra la última, aunque no caiga en el paso).
  const labelStep = Math.ceil(n / (n > 20 ? 10 : n > 8 ? 6 : n || 1));

  const handleMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (n - 1));
    setHoverIndex(Math.min(n - 1, Math.max(0, index)));
  };

  const hoverXPercent = hoverIndex !== null ? (xAt(hoverIndex) / VIEW_WIDTH) * 100 : null;

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
        {xLabels.map((label, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
              {label}
            </text>
          ) : null
        )}
        {hoverIndex !== null && (
          <line
            x1={xAt(hoverIndex)}
            x2={xAt(hoverIndex)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        )}
        {series.map((s) => (
          <path key={s.key} d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {series.map((s) => (
          <circle
            key={s.key}
            cx={xAt(n - 1)}
            cy={yAt(s.values[n - 1] ?? 0)}
            r={5}
            fill={s.color}
            stroke="hsl(var(--card))"
            strokeWidth={2}
          />
        ))}
        {hoverIndex !== null &&
          series.map((s) => (
            <circle
              key={s.key}
              cx={xAt(hoverIndex)}
              cy={yAt(s.values[hoverIndex] ?? 0)}
              r={4}
              fill={s.color}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
          ))}
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
          <p className="text-muted-foreground mb-1">{(xTooltipLabels ?? xLabels)[hoverIndex]}</p>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="inline-block w-3 h-0.5 shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-medium">{formatSoles(s.values[hoverIndex] ?? 0)}</span>
              {series.length > 1 && <span className="text-muted-foreground">{s.label}</span>}
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-3 h-0.5 shrink-0" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SalesLineChart;
