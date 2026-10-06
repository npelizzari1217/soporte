"use client";

/**
 * ReparacionesList — tabla de reparaciones edilicias (T5.8). Avance visible
 * vía `porcentajeAvance` (persistido server-side, sobrevive al refresh —
 * a diferencia del checklist detallado de subtareas, ver `SubtareasDialog`).
 */
import { forwardRef, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { useReparaciones } from "../hooks/use-reparaciones";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { notifyError } from "@/shared/lib/toast";
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { ReparacionCreateDialog } from "./reparacion-create-dialog";
import { SubtareasDialog } from "./subtareas-dialog";
import { ComentariosDialog } from "./comentarios-dialog";
import { VincularCompraDialog } from "./vincular-compra-dialog";
import type { ReparacionListItem } from "../types";

/**
 * Filtro de bloqueo del listado (sdd/reparacion-bloqueada-por-compra, WU4).
 *
 * CLIENT-SIDE, a propósito (D8 del design): el backend ya manda el tenant
 * entero en `GET /reparaciones` (sin paginación), así que filtrar en el
 * servidor no ahorraría una sola fila transferida — solo agregaría un
 * parámetro que después "justificaría" paginar, algo que el proposal
 * descartó. Por eso se resuelve con `useMemo` sobre `reparacionesQuery.data`
 * y NUNCA se pasa a `useReparaciones()`.
 */
type FiltroBloqueo = "TODAS" | "BLOQUEADAS" | "NO_BLOQUEADAS";

const OPCIONES_FILTRO_BLOQUEO: ReadonlyArray<{ valor: FiltroBloqueo; etiqueta: string }> = [
  { valor: "TODAS", etiqueta: "Todas" },
  { valor: "BLOQUEADAS", etiqueta: "Bloqueadas" },
  { valor: "NO_BLOQUEADAS", etiqueta: "No bloqueadas" },
];

function filtrarPorBloqueo(
  datos: ReparacionListItem[],
  filtro: FiltroBloqueo,
): ReparacionListItem[] {
  if (filtro === "TODAS") return datos;
  return datos.filter((row) => (filtro === "BLOQUEADAS" ? row.bloqueada : !row.bloqueada));
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
 * Botón de la columna «Comentarios»: dispara el modal y lleva el conteo
 * colgado como badge.
 *
 * `forwardRef` + spread de props NO son decorativos. `DialogTrigger asChild`
 * CLONA este elemento e inyecta en él su `onClick`, su `ref` y los `aria-*`
 * de estado. Si el componente se quedara sólo con `cantidad` y descartara el
 * resto, el click nunca llegaría al `<button>` y el modal no abriría jamás
 * (así se rompió: el de subtareas usa un `Button` pelado y por eso no sufría
 * el problema). Los tests de etiqueta no ven esto — hace falta uno que
 * CLIQUEE.
 *
 * Accesibilidad: el badge va `aria-hidden` y el conteo se anuncia por el
 * `aria-label` del botón — un lector de pantalla leería si no un «3» suelto,
 * sin forma de saber que cuenta comentarios. Con cero comentarios no se
 * renderiza badge (la fila queda limpia) y el botón vuelve a su nombre
 * simple, sin un «(0 comentarios)» que no aporta nada.
 */
const ComentariosTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & { cantidad: number }
>(({ cantidad, ...props }, ref) => {
  const etiqueta =
    cantidad === 0
      ? "Ver comentarios"
      : `Ver comentarios (${cantidad} ${cantidad === 1 ? "comentario" : "comentarios"})`;

  return (
    <Button ref={ref} variant="outline" size="sm" aria-label={etiqueta} {...props}>
      Ver comentarios
      {cantidad > 0 && (
        <Badge variant="secondary" aria-hidden="true">
          {cantidad}
        </Badge>
      )}
    </Button>
  );
});
ComentariosTrigger.displayName = "ComentariosTrigger";

export function ReparacionesList() {
  const reparacionesQuery = useReparaciones();
  const [filtroBloqueo, setFiltroBloqueo] = useState<FiltroBloqueo>("TODAS");

  const datosFiltrados = useMemo(
    () => filtrarPorBloqueo(reparacionesQuery.data ?? [], filtroBloqueo),
    [reparacionesQuery.data, filtroBloqueo],
  );

  const columns: Column<ReparacionListItem>[] = [
    { key: "numero", header: "Número" },
    { key: "titulo", header: "Título" },
    { key: "ubicacion", header: "Ubicación", render: (row) => row.ubicacion ?? "—" },
    { key: "porcentajeAvance", header: "Avance", render: (row) => <AvanceCell porcentaje={row.porcentajeAvance} /> },
    {
      // Chip SIN número (decisión de producto #2440): responde "¿está
      // trabado?" de un vistazo. El botón «Gestionar compras» abre el panel
      // de vínculo/desvínculo (WU6) — gateado por `EDILICIA:ALTAS` DENTRO de
      // `VincularCompraDialog`, no acá: verlo o no depende de ese permiso,
      // no del `bloqueada` de la fila.
      key: "bloqueada",
      header: "Bloqueo",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.bloqueada && <Badge variant="warning">Bloqueada</Badge>}
          <VincularCompraDialog
            reparacionId={row.id}
            numero={row.numero}
            comprasQueBloquean={row.comprasQueBloquean}
            trigger={
              <Button variant="outline" size="sm">
                Gestionar compras
              </Button>
            }
          />
        </div>
      ),
    },
    {
      // `key` es el slot de la columna (React key + fallback de render), no
      // necesariamente el campo a mostrar: `Column<T>.key` está tipado como
      // `keyof T`, así que las columnas de acción reusan un campo existente.
      key: "subtareas",
      header: "Subtareas",
      render: (row) => (
        <SubtareasDialog
          reparacionId={row.id}
          numero={row.numero}
          subtareas={row.subtareas}
          trigger={
            <Button variant="outline" size="sm">
              Ver subtareas
            </Button>
          }
        />
      ),
    },
    {
      // Segundo modal hermano del de subtareas (ADR-1: `/edilicia` sin ruta
      // de detalle). Los comentarios son de la REPARACIÓN, no de cada
      // subtarea — por eso van en su propia columna y su propio diálogo.
      key: "id",
      header: "Comentarios",
      render: (row) => (
        <ComentariosDialog
          reparacionId={row.id}
          numero={row.numero}
          trigger={<ComentariosTrigger cantidad={row.cantidadComentarios} />}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reparaciones"
        actions={
          <>
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-bloqueo-reparaciones">Bloqueo</Label>
              <Select
                id="filtro-bloqueo-reparaciones"
                className="w-40"
                value={filtroBloqueo}
                onChange={(e) => setFiltroBloqueo(e.target.value as FiltroBloqueo)}
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
              `<Can permiso="EDILICIA:LECTURA">` por afuera de este
              componente — este `PageHeader` ya vive adentro de ese gate, así
              que un `<Can>` acá adentro sería redundante y quedaría
              desincronizado si el gate exterior cambia. El filtro de bloqueo
              NO se le pasa a este botón (D8/spec): la exportación siempre
              trae TODAS las reparaciones del tenant, sin importar lo que se
              vea filtrado en pantalla — mismo `useReparaciones()` sin
              filtros de arriba, la exportación no sabe que el filtro existe.
            */}
            <ExportarCsvButton
              recurso="reparaciones"
              nombrePorDefecto="reparaciones.csv"
            />
            <Can permiso="EDILICIA:ALTAS">
              <ReparacionCreateDialog />
            </Can>
          </>
        }
      />
      <DataTable
        columns={columns}
        data={datosFiltrados}
        getRowKey={(row) => row.id}
        isLoading={reparacionesQuery.isLoading}
        error={reparacionesQuery.isError ? "No se pudieron cargar las reparaciones." : undefined}
        onRetry={() => reparacionesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin reparaciones"
        emptyDescription="Creá la primera con «Nueva reparación»."
        hayFiltrosActivos={filtroBloqueo !== "TODAS"}
        onLimpiarFiltros={filtroBloqueo !== "TODAS" ? () => setFiltroBloqueo("TODAS") : undefined}
      />
    </div>
  );
}
