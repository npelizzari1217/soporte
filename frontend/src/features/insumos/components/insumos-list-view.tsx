"use client";

/**
 * InsumosListView — CONTAINER montado por `/insumos`: lista el catálogo de
 * insumos del inquilino.
 *
 * El gate de ACCESO a la vista es `INSUMOS:LECTURA`, y **el backend NO exige
 * ese permiso para leer el catálogo**: `GET /insumos` es lectura abierta para
 * cualquier autenticado del inquilino (`insumos.controller.ts`, el `@Get()` sin
 * `@RequiereAcciones`), y el ABM del catálogo se gatea por `AdminClienteGuard`,
 * no por la matriz `MODULO:ACCION`. Esto NO es un espejo más estricto que el
 * servidor: es el gate de una SECCIÓN, no el de un endpoint.
 *
 * El motivo es qué contiene la sección. `INSUMOS` gobierna el stock y la
 * bitácora de movimientos —lo dice `shared/auth/acciones.ts`, que aclara que NO
 * gobierna el catálogo—, y los dos endpoints que exponen eso exigen
 * `INSUMOS:LECTURA` hoy: `GET /insumos/:insumoId/stock` y
 * `GET /insumos/:insumoId/movimientos` (`movimientos-insumo.controller.ts`).
 * La ficha del insumo que va a consumirlos es una entrega pendiente, y cuando
 * exista vivirá dentro de esta sección. Abrir la sección a quien no tiene el
 * permiso sería ofrecerle un camino que termina en 403.
 *
 * Por eso tampoco vale el paralelo con `EquiposListView`, aunque el código se
 * le parezca: ahí el backend SÍ exige `EQUIPOS:LECTURA` en `GET /equipos*`, y
 * el gate de la vista espeja al servidor. Acá no espeja nada, decide otra cosa.
 *
 * Ninguno de los tres `use*` lleva gate propio: los tres endpoints son lectura
 * abierta porque otras pantallas los necesitan para poblar sus `<select>`. La
 * autoridad de autorización sigue siendo el backend (ADR-4); esto es UI.
 */
import { useInsumos } from "../hooks/use-insumos";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { nombreDeCatalogo } from "../lib/nombre-de-catalogo";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import type { Insumo } from "../types";

/** Placeholder de la celda sin valor, el mismo que usan los demás listados. */
const SIN_VALOR = "—";

/** @returns El listado del catálogo de insumos, gateado por `INSUMOS:LECTURA`. */
export function InsumosListView() {
  const insumosQuery = useInsumos();
  const familiasQuery = useFamiliasInsumo();
  const unidadesQuery = useUnidadesMedida();

  // Los dos catálogos auxiliares se pasan CRUDOS (`data` sin `?? []`): el
  // `undefined` es el dato que distingue "todavía no resolvió" de "resolvió
  // vacío", y aplanarlo acá haría que la celda acuse de eliminado a un valor
  // que está sano. Ver `nombreDeCatalogo`.
  const familias = { entradas: familiasQuery.data, cargando: familiasQuery.isLoading };
  const unidades = { entradas: unidadesQuery.data, cargando: unidadesQuery.isLoading };

  // Las columnas se arman DENTRO del componente porque dos de ellas resuelven
  // contra el estado de otras queries.
  const columns: Column<Insumo>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    {
      key: "familiaId",
      header: "Familia",
      render: (row) => nombreDeCatalogo(row.familiaId, familias),
    },
    {
      key: "unidadMedidaId",
      header: "Unidad de medida",
      render: (row) => nombreDeCatalogo(row.unidadMedidaId, unidades),
    },
    {
      key: "stockMinimo",
      header: "Stock mínimo",
      // Acá el guion SÍ es una afirmación sobre el dato, y es correcta:
      // `stockMinimo` es nullable en el backend y el null significa "sin
      // mínimo definido", no "no se pudo cargar".
      render: (row) => (row.stockMinimo === null ? SIN_VALOR : String(row.stockMinimo)),
    },
    {
      key: "activo",
      header: "Estado",
      // Se reusa el patrón de badge de los demás listados (success/outline),
      // pero NO su palabra: en este módulo "baja" ya significa otra cosa —el
      // insumo eliminado del catálogo, que `GET /insumos` ni siquiera devuelve
      // (ver `ETIQUETA_INSUMO_FUERA_DE_CATALOGO`)—. `activo: false` acá es
      // DESHABILITADO: sigue en el catálogo y se puede volver a elegir. NO
      // alinear esto con el `Activo`/`Baja` de `equipos-list-view.tsx`: la
      // divergencia es deliberada y el vocabulario de este módulo manda.
      render: (row) =>
        row.activo ? (
          <Badge variant="success">Habilitado</Badge>
        ) : (
          <Badge variant="outline">Deshabilitado</Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Insumos" />
      <Can
        permiso="INSUMOS:LECTURA"
        fallback={<ErrorState message="No tiene permiso para ver el catálogo de insumos." />}
      >
        <DataTable
          columns={columns}
          data={insumosQuery.data ?? []}
          getRowKey={(row) => row.id}
          isLoading={insumosQuery.isLoading}
          error={insumosQuery.isError ? "No se pudieron cargar los insumos." : undefined}
          onRetry={() => insumosQuery.refetch().catch(notifyError)}
          emptyTitle="Sin insumos"
          emptyDescription="Todavía no hay insumos cargados en el catálogo."
        />
      </Can>
    </div>
  );
}
