"use client";

/**
 * ReparacionesList — tabla de reparaciones edilicias (T5.8). Avance visible
 * vía `porcentajeAvance` (persistido server-side, sobrevive al refresh —
 * a diferencia del checklist detallado de subtareas, ver `SubtareasDialog`).
 */
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useReparaciones } from "../hooks/use-reparaciones";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { notifyError } from "@/shared/lib/toast";
import { ReparacionCreateDialog } from "./reparacion-create-dialog";
import { SubtareasDialog } from "./subtareas-dialog";
import { ComentariosDialog } from "./comentarios-dialog";
import type { ReparacionListItem } from "../types";

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

  const columns: Column<ReparacionListItem>[] = [
    { key: "numero", header: "Número" },
    { key: "titulo", header: "Título" },
    { key: "ubicacion", header: "Ubicación", render: (row) => row.ubicacion ?? "—" },
    { key: "porcentajeAvance", header: "Avance", render: (row) => <AvanceCell porcentaje={row.porcentajeAvance} /> },
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
          <Can permiso="EDILICIA:ALTAS">
            <ReparacionCreateDialog />
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={reparacionesQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={reparacionesQuery.isLoading}
        error={reparacionesQuery.isError ? "No se pudieron cargar las reparaciones." : undefined}
        onRetry={() => reparacionesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin reparaciones"
        emptyDescription="Creá la primera con «Nueva reparación»."
      />
    </div>
  );
}
