"use client";

/**
 * UnidadHistorialDialog — el historial de una unidad por número de serie: qué
 * le pasó, en orden cronológico (`GET …/unidades/:unidadId/historial`).
 *
 * Es de solo lectura y lo controla la sección de unidades: `unidad` en `null`
 * es el diálogo cerrado y no consulta nada.
 *
 * El destino de una entrega (equipo o sector) lo resuelve el backend LEYENDO
 * el movimiento del evento, así que acá se muestra tal cual: no hay segunda
 * definición de "a dónde fue". Las correcciones de serial muestran el serial
 * anterior, el nuevo y el motivo. El `Record` de etiquetas cubre los doce tipos
 * de evento del backend: uno nuevo rompe el typecheck en vez de dibujar una
 * fila sin nombre.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { useUsuariosTenant } from "@/features/usuarios/hooks/use-usuarios-tenant";
import { useHistorialUnidad } from "../hooks/use-historial-unidad";
import { nombreDeUsuario } from "../lib/nombre-de-usuario";
import type { EventoUnidad, TipoEventoUnidad, UnidadInsumo } from "../types";

/** Cómo se lee cada tipo de evento; el `Record` obliga a cubrir uno nuevo. */
export const ETIQUETA_EVENTO_UNIDAD: Record<TipoEventoUnidad, string> = {
  INGRESO: "Ingreso al depósito",
  ALTA_INSTALADA: "Alta como instalada",
  SERIAL_CARGADO: "Serial cargado",
  CORRECCION_SERIAL: "Corrección de serial",
  INSTALACION: "Instalación en un equipo",
  RETIRO_A_DEPOSITO: "Retiro al depósito",
  DESCARTE: "Descarte",
  ENTREGA: "Entrega",
  DEVOLUCION_DE_ENTREGA: "Devolución de una entrega",
  BAJA_DE_DEPOSITO: "Baja del depósito",
  RECUPERACION: "Recuperación de una pieza descartada",
  REACTIVACION: "Reactivación del componente",
};

/** Las líneas de detalle de un evento, en el orden en que se leen. */
function detallesDe(evento: EventoUnidad): string[] {
  const detalles: string[] = [];
  if (evento.serialAnterior !== null) detalles.push(`Serial anterior: ${evento.serialAnterior}`);
  if (evento.serialNuevo !== null) {
    detalles.push(
      evento.tipo === "CORRECCION_SERIAL"
        ? `Serial nuevo: ${evento.serialNuevo}`
        : `Serial: ${evento.serialNuevo}`,
    );
  }
  if (evento.equipoId !== null) detalles.push(`Equipo: ${evento.equipoNombre ?? "sin nombre"}`);
  if (evento.sectorId !== null) detalles.push(`Sector: ${evento.sectorNombre ?? "sin nombre"}`);
  if (evento.motivo !== null) detalles.push(`Motivo: ${evento.motivo}`);
  return detalles;
}

export interface UnidadHistorialDialogProps {
  insumoId: string;
  /** La unidad cuyo historial se muestra; `null` cierra el diálogo. */
  unidad: UnidadInsumo | null;
  onClose: () => void;
}

/**
 * @param insumoId Insumo dueño de la unidad.
 * @param unidad Unidad abierta, o `null` con el diálogo cerrado.
 * @param onClose Se llama al cerrar el diálogo.
 * @returns El diálogo con la línea de tiempo de la unidad.
 */
export function UnidadHistorialDialog({ insumoId, unidad, onClose }: UnidadHistorialDialogProps) {
  const query = useHistorialUnidad(insumoId, unidad?.id ?? null);
  // Dato accesorio: el 403 del técnico sin permisos de tickets se queda en la
  // línea (ver `nombreDeUsuario`), sin toast ni reintento.
  const usuariosQuery = useUsuariosTenant();

  function lineaDeTiempo() {
    if (query.isLoading) {
      return (
        <div role="status" aria-busy="true" aria-label="Cargando historial" className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      );
    }
    if (query.isError || !query.data) {
      return (
        <ErrorState
          message="No se pudo cargar el historial de la unidad."
          onRetry={() => query.refetch().catch(notifyError)}
        />
      );
    }
    if (query.data.length === 0) {
      return <p className="text-sm text-muted-foreground">La unidad todavía no tiene eventos.</p>;
    }
    return (
      <ol className="flex flex-col gap-3">
        {query.data.map((evento) => (
          <li key={evento.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
            <span className="text-sm font-medium text-foreground">
              {ETIQUETA_EVENTO_UNIDAD[evento.tipo]}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatearInstante(evento.createdAt)} ·{" "}
              {nombreDeUsuario(evento.usuarioId, {
                entradas: usuariosQuery.data,
                cargando: usuariosQuery.isLoading,
              })}
            </span>
            {detallesDe(evento).map((detalle) => (
              <span key={detalle} className="text-sm text-foreground">
                {detalle}
              </span>
            ))}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Dialog open={unidad !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historial de la unidad</DialogTitle>
          <DialogDescription>
            {unidad?.numeroSerie ? `Serial ${unidad.numeroSerie}` : "Serie pendiente"}
          </DialogDescription>
        </DialogHeader>
        {lineaDeTiempo()}
      </DialogContent>
    </Dialog>
  );
}
