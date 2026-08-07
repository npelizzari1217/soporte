/**
 * DonutChart — categorical distribution as a ring of stroked circle segments
 * (ADR-3: SVG propio). `computeDonutSegments` is a PURE function (extracted
 * per Extract-Before-Mock rule) so percentage/offset math is testable
 * without touching the DOM.
 */
import { ChartA11yTable } from "./chart-a11y-table";
import type { ChartDatum } from "./bar-chart";

export interface DonutSegment extends ChartDatum {
  percentage: number;
  startOffset: number;
}

const PALETTE = ["var(--primary)", "var(--accent-foreground)", "var(--muted-foreground)", "var(--destructive)"];

/** Computes each category's % of the total and its cumulative start offset (both in % units, 0-100). */
export function computeDonutSegments(data: ChartDatum[]): DonutSegment[] {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let cumulative = 0;

  return data.map((d) => {
    const percentage = total === 0 ? 0 : (d.value / total) * 100;
    const startOffset = cumulative;
    cumulative += percentage;
    return { ...d, percentage, startOffset };
  });
}

export interface DonutChartProps {
  data: ChartDatum[];
  title: string;
  size?: number;
}

export function DonutChart({ data, title, size = 160 }: DonutChartProps) {
  const segments = computeDonutSegments(data);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <figure role="img" aria-label={title} className="w-full">
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="mx-auto" width={size} height={size}>
        {segments.map((segment, i) => {
          const dash = (segment.percentage / 100) * circumference;
          const offset = -(segment.startOffset / 100) * circumference;
          return (
            <circle
              key={segment.label}
              data-testid="donut-segment"
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={16}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
        })}
      </svg>
      <ChartA11yTable data={data} />
    </figure>
  );
}
