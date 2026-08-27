"use client";

/**
 * PlanesPreventivoListView — CONTAINER montado por `/preventivo` (WU-7.2).
 * La columna "última generación" hace visible el HUECO de un plan huérfano:
 * un plan sin ninguna fila de auditoría todavía ("Nunca generó") es
 * exactamente el caso que conviene poder detectar de un vistazo, sin entrar
 * al detalle de cada plan uno por uno.
 */
import { useRouter } from "next/navigation";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { usePlanesPreventivo, useGeneracionesDeVariosPlanes, ultimaGeneracion } from "../hooks/use-planes-preventivo";
import { PlanPreventivoCreateDialog } from "./plan-preventivo-create-dialog";
import { badgeVariantDeResultado, etiquetaResultado } from "../lib/resultado-generacion";
import { objetivoLabel, unidadIntervaloLabel } from "../lib/plan-labels";
import type { PlanPreventivo, PreventivoGeneracion } from "../types";
import type { UseQueryResult } from "@tanstack/react-query";

/** Etiqueta de cadencia del plan ("Cada N día(s)/mes(es)"). */
function cadenciaLabel(plan: PlanPreventivo): string {
  return `Cada ${plan.intervaloValor} ${unidadIntervaloLabel(plan.intervaloUnidad)}`;
}

/**
 * Indexa los resultados de `useGeneracionesDeVariosPlanes` por `planId` para
 * que la columna "última generación" resuelva cada fila en O(1) en vez de
 * hacer un `findIndex` sobre `planes` por cada fila renderizada (hallazgo de
 * revisión: O(n²) sobre el listado completo).
 *
 * Indexa la QUERY ENTERA, no su `data`: quedarse solo con `data` pierde el
 * `isError`, y entonces un `GET .../generaciones` caído deja `undefined` —
 * indistinguible de un plan que nunca generó. La columna existe justamente
 * para detectar planes huérfanos, así que ese colapso manda al usuario a
 * investigar un plan sano.
 *
 * @param planes Planes del listado, en el mismo orden que se pidieron.
 * @param generacionesQueries Resultado de `useGeneracionesDeVariosPlanes`, que
 *   `useQueries` devuelve en el orden de entrada.
 * @returns Índice `planId` → query de sus generaciones.
 */
function indexarGeneracionesPorPlan(
  planes: PlanPreventivo[],
  generacionesQueries: UseQueryResult<PreventivoGeneracion[], Error>[],
): Map<string, UseQueryResult<PreventivoGeneracion[], Error> | undefined> {
  const indice = new Map<string, UseQueryResult<PreventivoGeneracion[], Error> | undefined>();
  planes.forEach((plan, i) => indice.set(plan.id, generacionesQueries[i]));
  return indice;
}

export function PlanesPreventivoListView() {
  const router = useRouter();
  const planesQuery = usePlanesPreventivo();
  const equiposQuery = useEquipos();

  const planes = planesQuery.data ?? [];
  const generacionesQueries = useGeneracionesDeVariosPlanes(planes.map((plan) => plan.id));
  const generacionesPorPlan = indexarGeneracionesPorPlan(planes, generacionesQueries);

  const columns: Column<PlanPreventivo>[] = [
    { key: "titulo", header: "Título" },
    {
      key: "equipoId",
      header: "Objetivo",
      // Distingue "no pude cargar el catálogo" de "el equipo ya no está en el
      // catálogo" (hallazgo H1, apply-progress-wu7-review3): sin el aviso, un
      // `GET /equipos` caído se veía IDÉNTICO a un equipo dado de baja
      // legítimamente — mismo texto "Equipo" en ambos casos.
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span>{objetivoLabel(row, equiposQuery.data)}</span>
          {row.equipoId && equiposQuery.isError && (
            <span role="alert" className="text-xs text-destructive">
              No se pudo verificar el equipo (catálogo no disponible).
            </span>
          )}
        </div>
      ),
    },
    { key: "intervaloValor", header: "Cadencia", render: (row) => cadenciaLabel(row) },
    {
      key: "proximaEjecucionEn",
      header: "Próxima ejecución",
      // `proximaEjecucionEn` (`PlanPreventivo`) espeja `proxima_ejecucion_en @db.Date`
      // (`prisma_tenant/schema.prisma`) — fecha de calendario, no instante.
      render: (row) => formatearFechaCalendario(row.proximaEjecucionEn),
    },
    {
      key: "id",
      header: "Última generación",
      // Distingue "no pude cargar el historial" de "este plan nunca generó",
      // igual que la columna "Objetivo" de arriba: sin el aviso, un
      // `GET .../generaciones` caído se veía IDÉNTICO a un plan huérfano.
      render: (row) => {
        const query = generacionesPorPlan.get(row.id);
        if (query?.isError) {
          return (
            <span role="alert" className="text-xs text-destructive">
              No se pudo cargar el historial de generaciones.
            </span>
          );
        }
        const ultima = ultimaGeneracion(query?.data);
        if (!ultima) {
          return <span className="text-sm text-muted-foreground">Nunca generó</span>;
        }
        return (
          <div className="flex items-center gap-2">
            {/* `fechaProgramada` (`PreventivoGeneracion`) espeja `fecha_programada @db.Date`
                (`prisma_tenant/schema.prisma`) — fecha de calendario, no instante. */}
            <span className="text-sm">{formatearFechaCalendario(ultima.fechaProgramada)}</span>
            <Badge variant={badgeVariantDeResultado(ultima.resultado)}>
              {etiquetaResultado(ultima.resultado)}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Baja</Badge>),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mantenimiento preventivo" />
      <Can
        permiso="PREVENTIVO:LECTURA"
        fallback={<ErrorState message="No tenés permiso para ver los planes de mantenimiento preventivo." />}
      >
        <div>
          <div className="mb-3 flex justify-end">
            <Can permiso="PREVENTIVO:ALTAS">
              <PlanPreventivoCreateDialog />
            </Can>
          </div>
          <DataTable
            columns={columns}
            data={planes}
            getRowKey={(row) => row.id}
            isLoading={planesQuery.isLoading}
            error={planesQuery.isError ? "No se pudieron cargar los planes." : undefined}
            onRetry={() => planesQuery.refetch().catch(notifyError)}
            onRowClick={(row) => router.push(`/preventivo/${row.id}`)}
            emptyTitle="Sin planes"
            emptyDescription="Creá el primero con «Nuevo plan»."
          />
        </div>
      </Can>
    </div>
  );
}
