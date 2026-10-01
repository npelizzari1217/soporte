"use client";

/**
 * EquiposListView — CONTAINER montado por `/equipos` (T5.12, migrado en
 * WU-7.6 — `sdd/matriz-permisos-por-usuario`). "Nuevo ticket de soporte" se
 * muestra a quien tenga `TICKETS:ALTAS` Y el módulo TICKETS (el endpoint
 * POST /soporte exige `@RequiereAcciones('TICKETS:ALTAS')`, WU-7.3): sin el
 * módulo, el botón daba 403 al enviar. Independiente del inventario de
 * equipos.
 *
 * DEVIACIÓN vs. el mapeo mecánico del design (`equipos-list-view.tsx:55 →
 * EQUIPOS:ALTAS`): el gate de ACCESO a la vista pasa a `EQUIPOS:LECTURA`,
 * no `EQUIPOS:ALTAS` — verificado contra el backend real (R5:
 * `GET /equipos*` exige `EQUIPOS:LECTURA`, R7: todo usuario con el módulo
 * EQUIPOS ya recibía esa celda en el backfill). Gatear la vista completa
 * por `ALTAS` le escondería el inventario a un lector sin permiso de
 * creación, aunque el backend SÍ le devolvería 200 — regresión frontend más
 * estricto que backend, contraria al criterio "expandir, no interpretar"
 * (#2212). El botón "Nuevo equipo" (`EquipoCreateDialog`) SÍ gatea aparte
 * por `EQUIPOS:ALTAS`, que es la acción real que ejecuta.
 */
import { useRouter } from "next/navigation";
import { useEquipos } from "../hooks/use-equipos";
import { useSession } from "@/shared/hooks/use-session";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { EquipoCreateDialog } from "./equipo-create-dialog";
import { TicketSoporteCreateDialog } from "./ticket-soporte-create-dialog";
import { useModelosEquipo } from "@/features/modelos-equipo/hooks/use-modelos-equipo";
import { resolverDeCatalogo, type EstadoCatalogo } from "@/features/insumos/lib/resolucion-de-catalogo";
import {
  ETIQUETA_CATALOGO_CARGANDO,
  ETIQUETA_CATALOGO_NO_DISPONIBLE,
  ETIQUETA_FUERA_DE_CATALOGO,
} from "@/features/insumos/lib/nombre-de-catalogo";
import type { Equipo } from "../types";
import type { ModeloEquipo } from "@/features/modelos-equipo/types";

/**
 * Resuelve el texto de la celda `Marca` (ADR-2/ADR-3 del design de
 * modelos-equipo-catalogo-y-compatibilidad). Sin `modeloEquipoId`, sigue
 * mostrando `row.marca` de texto libre — camino de hoy, sin cambios. No se
 * reusa `nombreDeCatalogo()`: exige entradas `{id, nombre}` y `ModeloEquipo`
 * es `{id, marca, modelo}`.
 */
function marcaDeEquipo(row: Equipo, catalogo: EstadoCatalogo<ModeloEquipo>): string {
  if (!row.modeloEquipoId) return row.marca ?? "—";

  const resolucion = resolverDeCatalogo(row.modeloEquipoId, catalogo);
  // Sin `default`: el `switch` exhaustivo sobre la unión rompe el typecheck
  // acá si `ResolucionDeCatalogo` suma un estado nuevo, mismo criterio que
  // `nombreDeCatalogo`.
  switch (resolucion.estado) {
    case "CARGANDO":
      return ETIQUETA_CATALOGO_CARGANDO;
    case "NO_DISPONIBLE":
      return ETIQUETA_CATALOGO_NO_DISPONIBLE;
    case "FUERA_DE_CATALOGO":
      return ETIQUETA_FUERA_DE_CATALOGO;
    case "ENCONTRADA":
      return `${resolucion.entrada.marca} ${resolucion.entrada.modelo}`;
  }
}

export function EquiposListView() {
  const router = useRouter();
  const equiposQuery = useEquipos();
  const modelosQuery = useModelosEquipo();
  const { canModulo } = useSession();

  const columns: Column<Equipo>[] = [
    { key: "nombre", header: "Nombre" },
    {
      key: "marca",
      header: "Marca",
      render: (row) =>
        marcaDeEquipo(row, { entradas: modelosQuery.data, cargando: modelosQuery.isLoading }),
    },
    { key: "numeroSerie", header: "N.º de serie", render: (row) => row.numeroSerie ?? "—" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Baja</Badge>),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipos IT"
        actions={
          <>
            {/*
              Sin parámetros (sdd/exportar-listados-csv): el export trae solo los
              equipos vigentes, igual que `useEquipos()` de arriba. El backend ya
              acepta `?incluirBajas=true` (sdd/baja-equipo-completo); el filtro
              visible y su parámetro llegan con el frontend de ese cambio.
            */}
            <Can permiso="EQUIPOS:LECTURA">
              <ExportarCsvButton
                recurso="equipos"
                nombrePorDefecto="equipos.csv"
                etiqueta="Exportar a Excel"
              />
            </Can>
            {canModulo("TICKETS") ? (
              <Can permiso="TICKETS:ALTAS">
                <TicketSoporteCreateDialog />
              </Can>
            ) : undefined}
          </>
        }
      />
      <Can
        permiso="EQUIPOS:LECTURA"
        fallback={<ErrorState message="No tenés permiso para ver el inventario de equipos." />}
      >
        <div>
          <div className="mb-3 flex justify-end">
            <Can permiso="EQUIPOS:ALTAS">
              <EquipoCreateDialog />
            </Can>
          </div>
          <DataTable
            columns={columns}
            data={equiposQuery.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={equiposQuery.isLoading}
            error={equiposQuery.isError ? "No se pudieron cargar los equipos." : undefined}
            onRetry={() => equiposQuery.refetch().catch(notifyError)}
            onRowClick={(row) => router.push(`/equipos/${row.id}`)}
            emptyTitle="Sin equipos"
            emptyDescription="Creá el primero con «Nuevo equipo»."
          />
        </div>
      </Can>
    </div>
  );
}
