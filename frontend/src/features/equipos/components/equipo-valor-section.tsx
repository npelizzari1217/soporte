"use client";

/**
 * EquipoValorSection — valor del equipo en la ficha (odd/tasks/historial-valor-residual.md, S5):
 * el importe y el valor residual vigentes, cada uno con su fecha, y el historial del valor en
 * tabla y gráfico de línea.
 *
 * El vigente sale del detalle (`GET /equipos/:id`); el historial, de `GET /equipos/:id/valoraciones`,
 * que se pide aparte y tiene sus propios estados de carga y error: si falla, la ficha se ve igual.
 * Un equipo dado de baja también muestra su historial.
 *
 * Las fechas son de calendario (`@db.Date`): se muestran con `formatearFechaCalendario`.
 */
import { TrendingDown } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart } from "@/shared/charts/line-chart";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { useValoracionesEquipo } from "../hooks/use-valoraciones-equipo";
import type { Equipo, OrigenValoracionEquipo, ValoracionEquipo } from "../types";

/** Cómo se lee el origen de cada fila del historial. */
export const ETIQUETAS_ORIGEN_VALORACION: Record<OrigenValoracionEquipo, string> = {
  MANUAL: "Guardado en el equipo",
  MIGRACION: "Valor previo al historial",
};

export interface EquipoValorSectionProps {
  equipo: Pick<Equipo, "id" | "importe" | "fechaValoracion" | "valorResidual" | "fechaValorResidual">;
}

/**
 * Monto vigente con su fecha, o el aviso de que falta. Mira el tipo y no solo `null`: un monto
 * ausente del todo no puede llegar a `formatearNumeroEsAr` y romper la ficha entera.
 */
function MontoVigente({ monto, fecha }: { monto: number | null; fecha: string | null }) {
  if (typeof monto !== "number") return <span className="text-muted-foreground">Sin cargar</span>;
  return (
    <span>
      {formatearNumeroEsAr(monto)}{" "}
      <span className="text-muted-foreground">
        {fecha ? `al ${formatearFechaCalendario(fecha)}` : "(sin fecha)"}
      </span>
    </span>
  );
}

/** Nombre de quien guardó la fila; vacío en las de migración o si el usuario ya no existe. */
function nombreUsuario(valoracion: ValoracionEquipo): string {
  const nombre = [valoracion.usuarioNombre, valoracion.usuarioApellido].filter(Boolean).join(" ");
  return nombre || "—";
}

function HistorialValor({ equipoId }: { equipoId: string }) {
  const query = useValoracionesEquipo(equipoId);

  if (query.isLoading) return <TableSkeleton rows={3} columns={4} />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="No se pudo cargar el historial del valor."
        onRetry={() => {
          query.refetch().catch(() => {});
        }}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="Todavía no hay valores registrados"
        description="Cada vez que se guarda el equipo con un valor residual nuevo, queda una fila con su fecha."
      />
    );
  }

  const valoraciones = query.data;
  return (
    <div className="flex flex-col gap-4">
      <LineChart
        title="Evolución del valor del equipo"
        area
        data={valoraciones.map((v) => ({ label: formatearFechaCalendario(v.fecha), value: v.importe }))}
        a11y={{ categoryLabel: "Fecha", valueLabel: "Importe", formatValue: formatearNumeroEsAr }}
      />
      <Table aria-label="Historial del valor">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Usuario</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {valoraciones.map((v) => (
            <TableRow key={v.fecha}>
              <TableCell>{formatearFechaCalendario(v.fecha)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatearNumeroEsAr(v.importe)}</TableCell>
              <TableCell>{ETIQUETAS_ORIGEN_VALORACION[v.origen]}</TableCell>
              <TableCell>{nombreUsuario(v)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EquipoValorSection({ equipo }: EquipoValorSectionProps) {
  return (
    <section aria-labelledby="equipo-valor-titulo" className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 id="equipo-valor-titulo" className="text-base font-semibold">
        Valor del equipo
      </h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Importe</dt>
          <dd>
            <MontoVigente monto={equipo.importe} fecha={equipo.fechaValoracion} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Valor residual</dt>
          <dd>
            <MontoVigente monto={equipo.valorResidual} fecha={equipo.fechaValorResidual} />
          </dd>
        </div>
      </dl>
      <h3 className="text-sm font-semibold text-foreground">Historial del valor</h3>
      <HistorialValor equipoId={equipo.id} />
    </section>
  );
}
