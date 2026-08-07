/**
 * BarChart — vertical bars over a linear y-scale (ADR-3: SVG propio, cero
 * dependencias, 100% tokens oklch vía `var(--primary)` etc.).
 */
import { linearScale, niceTicks } from "./scale";
import { ChartA11yTable } from "./chart-a11y-table";

export interface ChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: ChartDatum[];
  title: string;
  width?: number;
  height?: number;
}

const MARGIN = { top: 8, right: 8, bottom: 24, left: 32 };

export function BarChart({ data, title, width = 320, height = 200 }: BarChartProps) {
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const yScale = linearScale([0, maxValue || 1], [innerHeight, 0]);
  const ticks = niceTicks(0, maxValue || 1, 4);
  const barWidth = data.length > 0 ? innerWidth / data.length : 0;
  const barPadding = barWidth * 0.2;

  return (
    <figure role="img" aria-label={title} className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="w-full">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={0}
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}
          {data.map((d, i) => {
            const barHeight = innerHeight - yScale(d.value);
            return (
              <rect
                key={d.label}
                data-testid="bar"
                x={i * barWidth + barPadding / 2}
                y={yScale(d.value)}
                width={barWidth - barPadding}
                height={barHeight}
                rx={2}
                fill="var(--primary)"
              />
            );
          })}
        </g>
      </svg>
      <ChartA11yTable data={data} />
    </figure>
  );
}
