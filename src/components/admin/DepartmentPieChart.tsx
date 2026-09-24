import { useState } from "react";

export interface PieSlice {
  key: string;
  label: string;
  color: string;
  value: number;
}

interface DepartmentPieChartProps {
  slices: PieSlice[];
  formatValue: (v: number) => string;
  size?: number;
}

const CENTER = 100;
const RADIUS = 88;
// Espacio de 2px entre gajos vecinos (mismo criterio que el spec de marcas
// de la skill de dataviz: "2px surface gap between fills, adjacent bars
// alike") — vía un stroke del color de la superficie de la tarjeta.
const GAP_STROKE = 2;
// Debajo de este % un gajo no lleva etiqueta propia adentro (se amontonaría
// texto ilegible) — solo aparece en el tooltip al pasar el mouse.
const MIN_LABEL_PERCENT = 6;

const polarToCartesian = (angleDeg: number, r: number = RADIUS) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
};

// Gajo en SVG plano (sin librería de gráficos, mismo criterio que
// SalesLineChart/IgvComparisonBarChart): empieza en las 12, sentido
// horario. Etiquetas selectivas de porcentaje adentro de los gajos grandes,
// leyenda siempre visible y tooltip por gajo al pasar el mouse.
const DepartmentPieChart = ({ slices, formatValue, size = 220 }: DepartmentPieChartProps) => {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let cursor = 0;
  const arcs = slices.map((s) => {
    const percent = total > 0 ? (s.value / total) * 100 : 0;
    const startAngle = cursor;
    const sweepAngle = total > 0 ? (s.value / total) * 360 : 0;
    cursor += sweepAngle;
    const endAngle = cursor;
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArc = sweepAngle > 180 ? 1 : 0;
    const midAngle = startAngle + sweepAngle / 2;
    const labelPoint = polarToCartesian(midAngle, RADIUS * 0.62);
    const isFullCircle = sweepAngle >= 359.99;
    const path = isFullCircle
      ? `M${CENTER},${CENTER - RADIUS} A${RADIUS},${RADIUS} 0 1,1 ${CENTER - 0.01},${CENTER - RADIUS} Z`
      : `M${CENTER},${CENTER} L${start.x},${start.y} A${RADIUS},${RADIUS} 0 ${largeArc},1 ${end.x},${end.y} Z`;
    return { ...s, percent, path, labelPoint };
  });

  const hovered = arcs.find((a) => a.key === hoverKey);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`} width={size} height={size}>
          {arcs.map((a) => (
            <path
              key={a.key}
              d={a.path}
              fill={a.color}
              stroke="hsl(var(--card))"
              strokeWidth={GAP_STROKE}
              opacity={hoverKey && hoverKey !== a.key ? 0.55 : 1}
              onMouseEnter={() => setHoverKey(a.key)}
              onMouseLeave={() => setHoverKey(null)}
              style={{ cursor: "pointer", transition: "opacity 120ms" }}
            />
          ))}
          {arcs
            .filter((a) => a.percent >= MIN_LABEL_PERCENT)
            .map((a) => (
              <text
                key={`label-${a.key}`}
                x={a.labelPoint.x}
                y={a.labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="#fff"
                style={{ pointerEvents: "none" }}
              >
                {Math.round(a.percent)}%
              </text>
            ))}
        </svg>
        {hovered && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs z-10 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hovered.color }} />
              <span className="font-medium">{formatValue(hovered.value)}</span>
            </div>
            <p className="text-muted-foreground mt-0.5">
              {hovered.label} — {hovered.percent.toFixed(1)}%
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-border w-full">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DepartmentPieChart;
