"use client";

/**
 * ReparacionesList — grilla de la pantalla Edilicia (T5.8). El avance de la
 * fila es `porcentajeAvance`, que el backend calcula al leer sobre las tareas
 * activas del ticket (odd/tareas-con-tecnico, T3); las tareas en sí se
 * gestionan en `SubtareasDialog`.
 *
 * Selector de tipo (odd/ticket-unificado, S2, opción a de L7): la misma grilla
 * lista los tickets de cualquier tipo que el usuario ve, por `GET /reparaciones?tipo=`.
 * Sin tipo elegido lista los del módulo EDILICIA, como hasta ahora. Cada fila es
 * un ticket (`id` = id del ticket) y sus acciones van sobre el tipo de ESE ticket.
 */
import { forwardRef, useMemo, type ComponentPropsWithoutRef } from "react";
import { useSearchParams } from "next/navigation";
import { useReparaciones } from "../hooks/use-reparaciones";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { notifyError } from "@/shared/lib/toast";
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { ReparacionCreateDialog } from "./reparacion-create-dialog";
import { ReparacionEditDialog } from "./reparacion-edit-dialog";
import { useSession } from "@/shared/hooks/use-session";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import { useEstados, useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { puedeAltaManualEnAlgunModulo } from "@/features/tickets/lib/alta-manual";
import { buildIdToCodigoMap } from "@/features/tickets/lib/catalog-map";
import { SubtareasDialog } from "./subtareas-dialog";
import { ComentariosDialog } from "./comentarios-dialog";
import { VincularCompraDialog } from "./vincular-compra-dialog";
import type { FiltroBloqueo, ReparacionListItem, ReparacionesFiltros } from "../types";
import { Pagination } from "@/components/shared/pagination";
import { useUrlFilters } from "@/shared/hooks/use-url-filters";
import { Wrench } from "lucide-react";
import { formatearInstante } from "@/shared/lib/formato-fecha";

/**
 * Filtro de bloqueo del listado. Lo resuelve el SERVIDOR desde que el listado
 * se pagina (odd/reparaciones-paginadas): filtrar en el cliente solo vería la
 * página cargada. Vive en la URL junto con la página.
 */
const OPCIONES_FILTRO_BLOQUEO: ReadonlyArray<{ valor: FiltroBloqueo; etiqueta: string }> = [
  { valor: "TODAS", etiqueta: "Todas" },
  { valor: "BLOQUEADAS", etiqueta: "Bloqueadas" },
  { valor: "NO_BLOQUEADAS", etiqueta: "No bloqueadas" },
];

/** Valor del selector de tipo sin tipo elegido: los del módulo EDILICIA. */
const TIPO_POR_DEFECTO = "";

/** Opción del selector de tipo. */
interface OpcionTipo {
  id: string;
  nombre: string;
}

/**
 * Opciones del selector de tipo: los tipos con `LECTURA`, más el de la URL si
 * no está entre ellos. Sin esa opción el `<select>` nativo caería a «Todos los
 * de Edilicia» mientras la grilla lista otro tipo: la pantalla diría una cosa
 * y mostraría otra.
 *
 * La ausencia solo prueba que el tipo no se puede elegir (dado de baja o sin
 * `LECTURA`) cuando el catálogo YA resolvió; mientras carga o si falló, la
 * opción dice que se están cargando los tipos, no que no está disponible.
 */
function opcionesDeTipo(visibles: OpcionTipo[], resuelto: boolean, tipoElegido: string): OpcionTipo[] {
  if (!tipoElegido || visibles.some((tipo) => tipo.id === tipoElegido)) return visibles;
  return [...visibles, { id: tipoElegido, nombre: resuelto ? "Tipo no disponible" : "Cargando tipos…" }];
}

/** Tamaño de página del listado, el mismo que Tickets. */
const PAGE_SIZE = 10;

/** Lee el filtro de la URL; un valor desconocido cuenta como "Todas". */
function leerFiltroBloqueo(valor: string | null): FiltroBloqueo {
  return OPCIONES_FILTRO_BLOQUEO.some((opcion) => opcion.valor === valor) ? (valor as FiltroBloqueo) : "TODAS";
}

function AvanceCell({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{porcentaje}%</span>
    </div>
  );
}

/**
 * Botón de una columna de acción que lleva un conteo colgado como badge: el de
 * «Comentarios» y el de «Subtareas» (odd/ubicacion-sector-ticket, CA5).
 *
 * `forwardRef` + spread de props NO son decorativos. `DialogTrigger asChild`
 * CLONA este elemento e inyecta en él su `onClick`, su `ref` y los `aria-*`
 * de estado. Si el componente se quedara sólo con sus props propias y
 * descartara el resto, el click nunca llegaría al `<button>` y el modal no
 * abriría jamás (así se rompió el de comentarios la primera vez). Los tests de
 * etiqueta no ven esto — hace falta uno que CLIQUEE.
 *
 * Accesibilidad: el badge va `aria-hidden` y el conteo se anuncia por el
 * `aria-label` del botón — un lector de pantalla leería si no un «3» suelto,
 * sin forma de saber qué cuenta. Con cero no se renderiza badge (la fila queda
 * limpia) y el botón vuelve a su nombre simple, sin un «(0 …)» que no aporta
 * nada.
 */
const ConteoTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & {
    texto: string;
    cantidad: number;
    singular: string;
    plural: string;
  }
>(({ texto, cantidad, singular, plural, ...props }, ref) => {
  const etiqueta = cantidad === 0 ? texto : `${texto} (${cantidad} ${cantidad === 1 ? singular : plural})`;

  return (
    <Button ref={ref} variant="outline" size="sm" aria-label={etiqueta} {...props}>
      {texto}
      {cantidad > 0 && (
        <Badge variant="secondary" aria-hidden="true">
          {cantidad}
        </Badge>
      )}
    </Button>
  );
});
ConteoTrigger.displayName = "ConteoTrigger";

export function ReparacionesList() {
  const searchParams = useSearchParams();
  const { updateFiltros, irAPagina, limpiarFiltros } = useUrlFilters<ReparacionesFiltros>("pagina");
  const filtroBloqueo = leerFiltroBloqueo(searchParams.get("bloqueo"));
  const tipoElegido = searchParams.get("tipo") ?? TIPO_POR_DEFECTO;
  const pagina = Number(searchParams.get("pagina") ?? "1");
  const reparacionesQuery = useReparaciones({
    pagina,
    porPagina: PAGE_SIZE,
    bloqueo: filtroBloqueo,
    tipo: tipoElegido || undefined,
  });
  const { isGlobalAdmin } = useSession();
  // Las acciones de cada fila van sobre el tipo de SU ticket (odd/permisos-por-tipo-ticket, S6).
  const { puedeEnTipo, puedeEnModulo, tiposCon } = usePermisosPorTipo();
  // El selector ofrece los tipos con LECTURA, de cualquier módulo: otro tipo sería una grilla
  // que el backend siempre devuelve vacía (L13).
  const tiposQuery = useTiposTicket();
  const opcionesTipo = opcionesDeTipo(
    tiposCon(tiposQuery.data ?? [], "LECTURA"),
    tiposQuery.isSuccess,
    tipoElegido,
  );
  // El código del estado decide si la reparación "se empezó a trabajar" (odd/detalle-ticket-legible).
  const estadosQuery = useEstados();
  const estadoCodigoMap = useMemo(() => buildIdToCodigoMap(estadosQuery.data ?? []), [estadosQuery.data]);

  /**
   * La página cuenta como filtro cuando es mayor a 1, igual que en Tickets: una
   * `pagina` vieja en la URL puede dejar el listado vacío, y ese vacío tiene que
   * ofrecer «Limpiar filtros» en vez de parecer que no hay datos.
   */
  const hayFiltrosActivos = filtroBloqueo !== "TODAS" || tipoElegido !== TIPO_POR_DEFECTO || pagina > 1;

  const columns: Column<ReparacionListItem>[] = [
    {
      key: "numero",
      header: "Número",
      // Debajo del número, cuándo se creó el pedido: da la antigüedad sin
      // tener que abrir la reparación.
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{row.numero}</span>
          <span className="text-xs text-muted-foreground">{formatearInstante(row.createdAt)}</span>
        </div>
      ),
    },
    { key: "titulo", header: "Título" },
    // La ubicación del ticket, la única desde odd/ticket-unificado (L11).
    { key: "ubicacion", header: "Ubicación", render: (row) => row.ubicacion ?? "—" },
    // Sector del ticket base (odd/ubicacion-sector-ticket, CA4), por el nombre
    // que resuelve el backend aunque esté desactivado.
    { key: "sectorId", header: "Sector", render: (row) => row.sectorNombre ?? "—" },
    { key: "porcentajeAvance", header: "Avance", render: (row) => <AvanceCell porcentaje={row.porcentajeAvance} /> },
    {
      // Chip SIN número (decisión de producto #2440): responde "¿está
      // trabado?" de un vistazo, y lo ve todo el que ve la fila (L22). El botón
      // de compras abre el panel de vínculo/desvínculo, gateado DENTRO de
      // `VincularCompraDialog`: `COMPRAS:LECTURA` para verlo y `MODIFICACION`
      // sobre el tipo de la fila para vincular o desvincular (S4).
      key: "bloqueada",
      header: "Bloqueo",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.bloqueada && <Badge variant="warning">Bloqueada</Badge>}
          <VincularCompraDialog
            ticketId={row.ticketId}
            numero={row.numero}
            puedeModificarEnTipo={puedeEnTipo(row.tipoId, "MODIFICACION")}
          />
        </div>
      ),
    },
    {
      // Editar una reparación no empezada (odd/detalle-ticket-legible, S6). El botón se gatea por
      // `MODIFICACION` sobre el tipo de la fila acá y por la regla de estado/tareas/bloqueo dentro
      // del diálogo.
      // `key` es solo el slot de la columna: `descripcion` no se muestra en ninguna otra.
      key: "descripcion",
      header: "Editar",
      render: (row) =>
        puedeEnTipo(row.tipoId, "MODIFICACION") ? (
          <ReparacionEditDialog
            reparacion={row}
            estadoCodigo={estadoCodigoMap.get(row.estadoId)}
            esRoot={isGlobalAdmin}
          />
        ) : null,
    },
    {
      // `key` es el slot de la columna (React key + fallback de render), no
      // necesariamente el campo a mostrar: `Column<T>.key` está tipado como
      // `keyof T`, así que las columnas de acción reusan un campo existente.
      key: "subtareas",
      header: "Subtareas",
      render: (row) => (
        <SubtareasDialog
          ticketId={row.ticketId}
          tipoId={row.tipoId}
          numero={row.numero}
          estadoCodigo={estadoCodigoMap.get(row.estadoId)}
          bloqueada={row.bloqueada}
          // `subtareas` trae embebidas las tareas ACTIVAS del ticket: las mismas
          // que lista el diálogo y sobre las que se calcula el avance (CA5).
          trigger={
            <ConteoTrigger
              texto="Ver subtareas"
              cantidad={row.subtareas.length}
              singular="subtarea"
              plural="subtareas"
            />
          }
        />
      ),
    },
    {
      // Segundo modal hermano del de subtareas (ADR-1: `/edilicia` sin ruta
      // de detalle). Los comentarios son del TICKET, no de cada subtarea — por
      // eso van en su propia columna y su propio diálogo.
      key: "id",
      header: "Comentarios",
      render: (row) => (
        <ComentariosDialog
          reparacionId={row.id}
          numero={row.numero}
          // El comentario de esta pantalla es interno (L19, L20): pide `COMENTAR` y `OBSERVAR` sobre
          // el tipo, como el backend, y se acepta en cualquier estado del ticket.
          puedeComentar={puedeEnTipo(row.tipoId, "COMENTAR") && puedeEnTipo(row.tipoId, "OBSERVAR")}
          trigger={
            <ConteoTrigger
              texto="Ver comentarios"
              cantidad={row.cantidadComentarios}
              singular="comentario"
              plural="comentarios"
            />
          }
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={Wrench}
        title="Reparaciones"
        actions={
          <>
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-tipo-reparaciones">Tipo</Label>
              <Select
                id="filtro-tipo-reparaciones"
                className="w-48"
                value={tipoElegido}
                onChange={(e) => updateFiltros({ tipo: e.target.value || undefined })}
              >
                <option value={TIPO_POR_DEFECTO}>Todos los de Edilicia</option>
                {opcionesTipo.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-bloqueo-reparaciones">Bloqueo</Label>
              <Select
                id="filtro-bloqueo-reparaciones"
                className="w-40"
                value={filtroBloqueo}
                onChange={(e) =>
                  updateFiltros({ bloqueo: e.target.value === "TODAS" ? undefined : leerFiltroBloqueo(e.target.value) })
                }
              >
                {OPCIONES_FILTRO_BLOQUEO.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
            {/*
              Sin `Can` propio a propósito (sdd/exportar-listados-csv,
              capability exportacion-reparaciones): a diferencia de
              `EquiposListView`, `EdiliciaView` gatea la vista ENTERA con
              `LECTURA` sobre algún tipo de EDILICIA por afuera de este
              componente — este `PageHeader` ya vive adentro de ese gate, así
              que un `<Can>` acá adentro sería redundante y quedaría
              desincronizado si el gate exterior cambia. Ni el filtro de bloqueo
              ni la página se le pasan a este botón (D8/spec): la exportación
              trae TODAS las filas que el usuario puede ver (el backend aplica
              sus permisos por tipo), sin importar el filtro ni la página. El
              tipo sí viaja: decide QUÉ listado se ve, y exportar otro sería
              entregar algo distinto de la grilla (odd/ticket-unificado, S2).
            */}
            <ExportarCsvButton
              recurso="reparaciones"
              nombrePorDefecto="reparaciones.csv"
              queryString={tipoElegido ? new URLSearchParams({ tipo: tipoElegido }).toString() : undefined}
            />
            {/* Crea un ticket de cualquier tipo con alta manual (odd/ticket-unificado, S2). */}
            {puedeAltaManualEnAlgunModulo(puedeEnModulo) && <ReparacionCreateDialog />}
          </>
        }
      />
      <DataTable variante="tarjeta"
        columns={columns}
        data={reparacionesQuery.data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={reparacionesQuery.isLoading}
        error={reparacionesQuery.isError ? "No se pudieron cargar las reparaciones." : undefined}
        onRetry={() => reparacionesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin reparaciones"
        emptyDescription="Creá la primera con «Nueva reparación»."
        hayFiltrosActivos={hayFiltrosActivos}
        onLimpiarFiltros={limpiarFiltros}
      />
      {reparacionesQuery.data && (
        <Pagination
          page={reparacionesQuery.data.pagina}
          pageSize={reparacionesQuery.data.porPagina}
          total={reparacionesQuery.data.total}
          onPageChange={irAPagina}
        />
      )}
    </div>
  );
}
