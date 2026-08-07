/**
 * GaugeChart — semi-circle gauge for a single 0-100 percentage KPI (e.g. %SLA
 * cumplido). ADR-3: SVG propio, 100% tokens.
 */
import { ChartA11yTable } from "./chart-a11y-table";

export interface GaugeChartProps {
  value: number;
  title: string;
  size?: number;
}

export function GaugeChart({ value, title, size = 160 }: GaugeChartProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 12;
  const halfCircumference = Math.PI * radius;
  const filled = (clamped / 100) * halfCircumference;
  const center = size / 2;

  return (
    <figure role="img" aria-label={`${title}: ${clamped}%`} className="w-full">
      <svg viewBox={`0 0 ${size} ${size / 2 + 12}`} aria-hidden="true" className="mx-auto" width={size} height={size / 2 + 12}>
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          data-testid="gauge-fg"
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${halfCircumference - filled}`}
        />
        <text x={center} y={center - 4} textAnchor="middle" fontSize={22} fontWeight={600} fill="var(--foreground)">
          {clamped}%
        </text>
      </svg>
      <ChartA11yTable data={[{ label: title, value: clamped }]} valueLabel="Porcentaje" />
    </figure>
  );
}
