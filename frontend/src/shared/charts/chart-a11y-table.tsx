/**
 * ChartA11yTable — screen-reader-only fallback table (ADR-3: tabla accesible
 * oculta como fallback). Sighted users see the SVG (`aria-hidden`); assistive
 * tech gets this semantic table instead of trying to parse vector paths.
 */
export interface ChartA11yTableProps {
  data: { label: string; value: number }[];
  valueLabel?: string;
  /** Encabezado de la columna de etiquetas (por ejemplo "Fecha" en una serie temporal). */
  categoryLabel?: string;
  /** Cómo se lee cada valor (por ejemplo un monto con dos decimales); por defecto, el número crudo. */
  formatValue?: (value: number) => string;
}

export function ChartA11yTable({
  data,
  valueLabel = "Valor",
  categoryLabel = "Categoría",
  formatValue = String,
}: ChartA11yTableProps) {
  return (
    <table className="sr-only">
      <thead>
        <tr>
          <th>{categoryLabel}</th>
          <th>{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <td>{d.label}</td>
            <td>{formatValue(d.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
