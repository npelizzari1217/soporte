/**
 * ChartA11yTable — screen-reader-only fallback table (ADR-3: tabla accesible
 * oculta como fallback). Sighted users see the SVG (`aria-hidden`); assistive
 * tech gets this semantic table instead of trying to parse vector paths.
 */
export interface ChartA11yTableProps {
  data: { label: string; value: number }[];
  valueLabel?: string;
}

export function ChartA11yTable({ data, valueLabel = "Valor" }: ChartA11yTableProps) {
  return (
    <table className="sr-only">
      <thead>
        <tr>
          <th>Categoría</th>
          <th>{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <td>{d.label}</td>
            <td>{d.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
