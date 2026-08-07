/**
 * LineChart — polyline over a linear scale, with an optional filled area
 * beneath it (ADR-3: SVG propio, cero dependencias).
 */
import { linearScale, niceTicks } from "./scale";
import { ChartA11yTable } from "./chart-a11y-table";
import type { ChartDatum } from "./bar-chart";

export interface LineChartProps {
  data: ChartDatum[];
  title: string;
  width?: number;
  height?: number;
  area?: boolean;
}

const MARGIN = { top: 8, right: 8, bottom: 24, left: 32 };

export function LineChart({ data, title, width = 320, height = 200, area = false }: LineChartProps) {
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const yScale = linearScale([0, maxValue || 1], [innerHeight, 0]);
  const xScale = linearScale([0, Math.max(1, data.length - 1)], [0, innerWidth]);
  const ticks = niceTicks(0, maxValue || 1, 4);

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(" ");
  const areaPoints = `0,${innerHeight} ${points} ${innerWidth},${innerHeight}`;

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
          {area && (
            <polygon data-testid="line-area" points={areaPoints} fill="var(--primary)" fillOpacity={0.15} />
          )}
          <polyline
            data-testid="line-path"
            points={points}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {data.map((d, i) => (
            <circle key={d.label} cx={xScale(i)} cy={yScale(d.value)} r={3} fill="var(--primary)" />
          ))}
        </g>
      </svg>
      <ChartA11yTable data={data} />
    </figure>
  );
}
