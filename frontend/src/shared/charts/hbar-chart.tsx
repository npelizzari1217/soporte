/**
 * HBarChart — horizontal bars (ADR-3), used for "carga por agente" style KPIs
 * where labels are typically long names better read left-to-right.
 */
import { linearScale } from "./scale";
import { ChartA11yTable } from "./chart-a11y-table";
import type { ChartDatum } from "./bar-chart";

export interface HBarChartProps {
  data: ChartDatum[];
  title: string;
  width?: number;
  barHeight?: number;
}

const MARGIN = { top: 4, right: 16, bottom: 4, left: 96 };

export function HBarChart({ data, title, width = 320, barHeight = 24 }: HBarChartProps) {
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const gap = 8;
  const height = data.length * barHeight + Math.max(0, data.length - 1) * gap + MARGIN.top + MARGIN.bottom;

  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const xScale = linearScale([0, maxValue || 1], [0, innerWidth]);

  return (
    <figure role="img" aria-label={title} className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="w-full">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {data.map((d, i) => {
            const y = i * (barHeight + gap);
            return (
              <g key={d.label}>
                <text x={-8} y={y + barHeight / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
                  {d.label}
                </text>
                <rect
                  data-testid="hbar"
                  x={0}
                  y={y}
                  width={xScale(d.value)}
                  height={barHeight}
                  rx={2}
                  fill="var(--primary)"
                />
              </g>
            );
          })}
        </g>
      </svg>
      <ChartA11yTable data={data} />
    </figure>
  );
}
