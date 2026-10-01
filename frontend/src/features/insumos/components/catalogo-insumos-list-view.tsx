"use client";

/**
 * CatalogoInsumosListView — listado GENÉRICO de un catálogo de insumos
 * filtrado por `esRepuesto` (WU-2, sdd/repuestos-seccion). Es el componente
 * que de verdad pinta la tabla: `InsumosListView` (`/insumos`) y
 * `RepuestosListView` (`/repuestos`) son wrappers finos que solo fijan
 * `esRepuesto` y la copy de su sección — la pantalla es la MISMA con otro
 * filtro y otro título, así que partirla en dos componentes casi idénticos
 * hubiera sido exactamente la duplicación que este WU pidió evitar.
 *
 * El gate de ACCESO a las dos secciones es `INSUMOS:LECTURA` (decisión del
 * dueño del repo: no hay permiso `REPUESTOS` propio), y **el backend NO
 * exige ese permiso para leer el catálogo**: `GET /insumos` es lectura
 * abierta para cualquier autenticado del inquilino
 * (`insumos.controller.ts`, el `@Get()` sin `@RequiereAcciones`), y el ABM
 * del catálogo se gatea por `AdminClienteGuard`, no por la matriz
 * `MODULO:ACCION`. Esto NO es un espejo más estricto que el servidor: es el
 * gate de una SECCIÓN, no el de un endpoint.
 *
 * El motivo es qué contiene la sección. `INSUMOS` gobierna el stock y la
 * bitácora de movimientos —lo dice `shared/auth/acciones.ts`, que aclara que
 * NO gobierna el catálogo—, y los dos endpoints que exponen eso exigen
 * `INSUMOS:LECTURA` hoy: `GET /insumos/:insumoId/stock` y
 * `GET /insumos/:insumoId/movimientos` (`movimientos-insumo.controller.ts`).
 * La ficha del insumo (`/insumos/[id]`, `InsumoDetailView`) ya consume el
 * primero y se alcanza haciendo click en una fila de este listado. Abrir la
 * sección a quien no tiene el permiso sería ofrecerle un camino que termina
 * en 403.
 *
 * Por eso tampoco vale el paralelo con `EquiposListView`, aunque el código se
 * le parezca: ahí el backend SÍ exige `EQUIPOS:LECTURA` en `GET /equipos*`, y
 * el gate de la vista espeja al servidor. Este gate no espeja nada: decide
 * otra cosa.
 *
 * Ninguno de los tres `use*` lleva gate propio: los tres endpoints son lectura
 * abierta porque otras pantallas los necesitan para poblar sus `<select>`. La
 * autoridad de autorización sigue siendo el backend (ADR-4); esto es UI.
 *
 * La fila navega a la ficha de SU sección: `/insumos/:id` o `/repuestos/:id`.
 * La ficha (`InsumoDetailView`) es una sola vista montada en las dos rutas;
 * adapta su copy a la familia del ítem, así que no se duplica.
 */
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInsumos } from "../hooks/use-insumos";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { nombreDeCatalogo } from "../lib/nombre-de-catalogo";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/shared/lib/toast";
import { InsumoFormDialog } from "./insumo-form-dialog";
import type { Insumo } from "../types";

/** Placeholder de la celda sin valor, el mismo que usan los demás listados. */
const SIN_VALOR = "—";

export interface CatalogoInsumosListViewProps {
  /** `false` = consumibles (Insumos); `true` = repuestos de equipo (Repuestos). Viaja tal cual a `useInsumos` — el filtro real corre en el backend. */
  esRepuesto: boolean;
  /** Título de la sección, en plural y con mayúscula inicial: "Insumos" | "Repuestos". */
  tituloSeccion: string;
  /** Nombre singular en minúscula, para armar la copy derivada: "insumo" | "repuesto". */
  nombreSingular: string;
}

/** @returns El listado del catálogo (Insumos o Repuestos), gateado por `INSUMOS:LECTURA`. */
export function CatalogoInsumosListView({
  esRepuesto,
  tituloSeccion,
  nombreSingular,
}: CatalogoInsumosListViewProps) {
  const router = useRouter();
  const insumosQuery = useInsumos(esRepuesto);
  const familiasQuery = useFamiliasInsumo();
  const unidadesQuery = useUnidadesMedida();

  // Los dos catálogos auxiliares se pasan CRUDOS (`data` sin `?? []`): el
  // `undefined` es el dato que distingue "todavía no resolvió" de "resolvió
  // vacío", y aplanarlo en este punto haría que la celda acuse de eliminado a un valor
  // que está sano. Ver `nombreDeCatalogo`.
  const familias = { entradas: familiasQuery.data, cargando: familiasQuery.isLoading };
  const unidades = { entradas: unidadesQuery.data, cargando: unidadesQuery.isLoading };

  const tituloMinuscula = tituloSeccion.toLowerCase();

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
      // (ver `ETIQUETA_INSUMO_FUERA_DE_CATALOGO`)—. `activo: false` en este caso es
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
      <PageHeader title={tituloSeccion} />
      <Can
        permiso="INSUMOS:LECTURA"
        fallback={<ErrorState message={`No tiene permiso para ver el catálogo de ${tituloMinuscula}.`} />}
      >
        <div>
          {/* Gate `AdminClienteGuard` (ADMINISTRADOR-o-ROOT), no la matriz de
              permisos: el ABM del catálogo se gatea 100% por rol, igual que
              familias/unidades — ver el JSDoc de `InsumosController`. El
              listado sigue siendo de lectura abierta para cualquier
              autenticado del inquilino; solo este trigger desaparece. */}
          <div className="mb-3 flex justify-end gap-2">
            {/* Entrada al reporte de stock (reporte-stock-insumos): vive acá,
                dentro del `<Can>` de la sección, con el tipo ya precargado.
                No hay ítem nuevo en el sidebar. */}
            <Button asChild size="sm" variant="outline">
              <Link href={`/insumos/reporte-stock?esRepuesto=${esRepuesto}`}>Reporte de stock</Link>
            </Button>
            <SoloAdminCliente>
              <InsumoFormDialog
                trigger={
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nuevo {nombreSingular}
                  </Button>
                }
              />
            </SoloAdminCliente>
          </div>
          <DataTable
            columns={columns}
            data={insumosQuery.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={insumosQuery.isLoading}
            error={insumosQuery.isError ? `No se pudieron cargar los ${tituloMinuscula}.` : undefined}
            onRetry={() => insumosQuery.refetch().catch(notifyError)}
            onRowClick={(row) => router.push(`/${esRepuesto ? "repuestos" : "insumos"}/${row.id}`)}
            emptyTitle={`Sin ${tituloMinuscula}`}
            emptyDescription={`Todavía no hay ${nombreSingular}s cargados en el catálogo.`}
          />
        </div>
      </Can>
    </div>
  );
}
