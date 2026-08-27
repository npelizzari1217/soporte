"use client";

/**
 * PlanPreventivoDetailView — CONTAINER montado por `/preventivo/[id]` (WU-7.3).
 * El backend NO expone `GET /preventivo/planes/:id` (WU-4) — el plan se
 * deriva del listado cacheado (`usePlanPreventivo`); la vista de generaciones
 * SÍ consume su endpoint propio (`GET /preventivo/planes/:id/generaciones`,
 * ya existente desde WU-4) — este WU es consumo, no API nueva.
 *
 * Gate: el detalle completo (datos del plan + generaciones) requiere
 * `PREVENTIVO:LECTURA` (`<Can>`, fallback con `<ErrorState>`) — el layout de
 * `/preventivo` solo gatea por MÓDULO, no por permiso, así que sin este gate
 * propio un actor con el módulo pero sin `PREVENTIVO:LECTURA` entraría igual.
 * "Dar de baja" tiene su propio gate `PREVENTIVO:BORRADO`, anidado adentro.
 *
 * El `<Can>` envuelve TODO el árbol, incluidos los estados de loading/error de
 * `planQuery` — no solo el contenido final. `PreventivoController.listar()`
 * (backend) exige `PREVENTIVO:LECTURA` para el MISMO endpoint del que sale
 * `planQuery`: un actor sin ese permiso recibe 403 y `planQuery` cae en
 * `isError`, así que si el gate se evaluara DESPUÉS del `if (isError)`, ese
 * `return` temprano se disparaba primero y el mensaje de permiso nunca se
 * llegaba a mostrar — el usuario veía "No se pudo cargar el plan" con un
 * botón "Reintentar" que jamás podía funcionar (hallazgo H2, apply-progress-wu7-review2).
 */
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { notifyError } from "@/shared/lib/toast";
import { usePlanPreventivo, useGeneracionesPlan } from "../hooks/use-planes-preventivo";
import { useDarDeBajaPlanPreventivo } from "../hooks/use-planes-preventivo-mutations";
import { badgeVariantDeResultado, etiquetaResultado } from "../lib/resultado-generacion";
import { objetivoLabel, unidadIntervaloLabel } from "../lib/plan-labels";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import type { PreventivoGeneracion } from "../types";

export interface PlanPreventivoDetailViewProps {
  planId: string;
}

export function PlanPreventivoDetailView({ planId }: PlanPreventivoDetailViewProps) {
  const router = useRouter();
  const planQuery = usePlanPreventivo(planId);
  const equiposQuery = useEquipos();
  const generacionesQuery = useGeneracionesPlan(planId);
  const darDeBajaMutation = useDarDeBajaPlanPreventivo();

  // El contenido se arma en una variable, no con `return` tempranos, para que
  // TODOS los estados (loading/notFound/error/OK) queden ADENTRO del `<Can>`
  // de más abajo — ver el comentario del gate en el header del archivo (H2).
  let content: ReactNode;

  if (planQuery.isLoading) {
    content = <DetailSkeleton />;
  } else if (planQuery.notFound) {
    content = <ErrorState message="El plan no existe o fue dado de baja." />;
  } else if (planQuery.isError || !planQuery.data) {
    content = (
      <ErrorState
        message="No se pudo cargar el plan."
        onRetry={() => {
          planQuery.refetch().catch(notifyError);
        }}
      />
    );
  } else {
    const plan = planQuery.data;
    const objetivo = objetivoLabel(plan, equiposQuery.data);
    const unidad = unidadIntervaloLabel(plan.intervaloUnidad);

    const columns: Column<PreventivoGeneracion>[] = [
      {
        key: "fechaProgramada",
        header: "Fecha programada",
        // `fechaProgramada` (`PreventivoGeneracion`) espeja `fecha_programada @db.Date`
        // (`prisma_tenant/schema.prisma`) — fecha de calendario, no instante.
        render: (row) => formatearFechaCalendario(row.fechaProgramada),
      },
      {
        key: "resultado",
        header: "Resultado",
        render: (row) => <Badge variant={badgeVariantDeResultado(row.resultado)}>{etiquetaResultado(row.resultado)}</Badge>,
      },
      {
        key: "ticketId",
        header: "Ticket generado",
        // Muestra el UUID crudo porque `PreventivoGeneracionResponseDto` no lleva
        // `Ticket.numero` (el número legible, `@unique @db.VarChar(20)`) — eso
        // requiere un cambio de DTO en el backend, fuera de alcance de este WU
        // ("consumo, no API nueva"). Mientras tanto, al menos es un link navegable.
        render: (row) =>
          row.ticketId ? (
            <Link href={`/tickets/${row.ticketId}`} className="text-primary underline-offset-4 hover:underline">
              {row.ticketId}
            </Link>
          ) : (
            "—"
          ),
      },
    ];

    content = (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={plan.titulo}
          // `proximaEjecucionEn` (`PlanPreventivo`) espeja `proxima_ejecucion_en @db.Date`
          // (`prisma_tenant/schema.prisma`) — fecha de calendario, no instante: `formatearFechaCalendario`.
          description={`${objetivo} · Cada ${plan.intervaloValor} ${unidad} · Próxima ejecución: ${formatearFechaCalendario(plan.proximaEjecucionEn)}`}
          actions={
            plan.activo ? (
              <Can permiso="PREVENTIVO:BORRADO">
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" size="sm">
                      Dar de baja
                    </Button>
                  }
                  title="Dar de baja plan"
                  description={`¿Confirmás dar de baja "${plan.titulo}"? Deja de generar ciclos futuros; lo ya generado no se toca.`}
                  confirmLabel="Dar de baja"
                  confirmVariant="destructive"
                  isConfirming={darDeBajaMutation.isPending}
                  onConfirm={() => darDeBajaMutation.mutate(plan.id, { onSuccess: () => router.push("/preventivo") })}
                />
              </Can>
            ) : (
              <Badge variant="outline">Baja</Badge>
            )
          }
        />

        {/* Distingue "no pude cargar el catálogo" de "el equipo ya no está
            en el catálogo" (hallazgo H1, apply-progress-wu7-review3):
            `objetivo` de arriba cae al fallback "Equipo" en AMBOS casos, así
            que sin este aviso los dos escenarios eran indistinguibles para
            el usuario — el que necesita descartar la falla de catálogo antes
            de asumir que el equipo real fue dado de baja. */}
        {plan.equipoId && equiposQuery.isError && (
          <p role="alert" className="text-sm text-destructive">
            No se pudo verificar el equipo del objetivo (catálogo no disponible).
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium text-foreground">Generaciones</h2>
          <DataTable
            columns={columns}
            data={generacionesQuery.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={generacionesQuery.isLoading}
            error={generacionesQuery.isError ? "No se pudieron cargar las generaciones." : undefined}
            onRetry={() => generacionesQuery.refetch().catch(notifyError)}
            emptyTitle="Sin generaciones"
            emptyDescription="Este plan todavía no generó ningún ciclo."
          />
        </div>
      </div>
    );
  }

  return (
    <Can permiso="PREVENTIVO:LECTURA" fallback={<ErrorState message="No tenés permiso para ver este plan." />}>
      {content}
    </Can>
  );
}
