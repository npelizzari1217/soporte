"use client";

/**
 * VincularCompraDialog — panel de compras que frenan una reparación
 * (sdd/reparacion-bloqueada-por-compra, WU6). Un solo diálogo muestra las
 * compras hoy vinculadas (con acción de desvincular) y un selector para
 * vincular una compra nueva. Hermano de `SubtareasDialog`/`ComentariosDialog`:
 * sin ruta de detalle (ADR-1), disparado por fila en `ReparacionesList`.
 *
 * IMPORTANTE — qué NO hace este componente: los dos `<Can>` de abajo son
 * controles de EXPERIENCIA (ocultan botones a quien no va a poder usarlos),
 * nunca de seguridad. La autorización real la sostiene el backend, que para
 * vincular y para desvincular exige lo mismo (odd/ticket-unificado, S4):
 * `COMPRAS:LECTURA` en la ruta (`@RequiereAcciones`) **y** `MODIFICACION`
 * sobre el tipo del ticket en el caso de uso. Estos controles todavía ofrecen
 * vincular con `ALTAS` (`puedeVincularEnTipo`) y desvincular con
 * `EDILICIA:BORRADO`: alinearlos es la tarea T3 de odd/tasks/ticket-unificado.md.
 * Un `curl` directo sin el `<Can>` (que no existe fuera del navegador) sigue
 * recibiendo 403 si le falta el permiso: la interfaz nunca es el único
 * candado.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import { useCompras } from "@/features/compras/hooks/use-compras";
import { useDesvincularCompra, useVincularCompra } from "../hooks/use-reparacion-compra-mutations";

export interface VincularCompraDialogProps {
  reparacionId: string;
  numero: string;
  /** Subset mínimo (`id`+`numero`) de las compras que HOY frenan la reparación — sale de `ReparacionListItem.comprasQueBloquean`. */
  comprasQueBloquean: { id: string; numero: string }[];
  /** `ALTAS` sobre el tipo del ticket de la reparación (odd/permisos-por-tipo-ticket, D5 c). */
  puedeVincularEnTipo: boolean;
  trigger: ReactNode;
}

export function VincularCompraDialog({
  reparacionId,
  numero,
  comprasQueBloquean,
  puedeVincularEnTipo,
  trigger,
}: VincularCompraDialogProps) {
  const [open, setOpen] = useState(false);
  const [compraSeleccionada, setCompraSeleccionada] = useState("");

  // `estado: 'ACTIVAS'` (WU6.3): solo tiene sentido ofrecer compras que TODAVÍA
  // pueden frenar algo — una compra ya entregada/cancelada no aporta al selector.
  const comprasQuery = useCompras({ estado: "ACTIVAS" });
  const vincularMutation = useVincularCompra(reparacionId);
  const desvincularMutation = useDesvincularCompra(reparacionId);

  const comprasDisponibles = comprasQuery.data?.items ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compraSeleccionada) return;
    vincularMutation.mutate(
      { compraId: compraSeleccionada },
      { onSuccess: () => setCompraSeleccionada("") },
    );
  }

  // Hooks, no condicionales: se evalúan siempre y se combinan abajo.
  const puedeLeerCompras = useCan("COMPRAS:LECTURA");
  const puedeVincular = puedeVincularEnTipo && puedeLeerCompras;
  const puedeDesvincular = useCan("EDILICIA:BORRADO");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* El panel se abre pudiendo vincular O con EDILICIA:BORRADO, no solo
          con lo primero. Cada acción de adentro tiene su propio gate, así que
          abrir no habilita nada: quien solo puede desvincular entra, ve las
          compras vinculadas y su botón Desvincular, y no ve el formulario de
          vincular. Gatear el trigger solo por ALTAS dejaba a ese usuario
          viendo el chip «Bloqueada» sin ninguna forma de sacarlo, aunque el
          backend le permite el DELETE. El chip sigue visible para cualquiera
          que vea la fila. */}
      {(puedeVincular || puedeDesvincular) && (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compras vinculadas — {numero}</DialogTitle>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {comprasQueBloquean.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin compras vinculadas.</p>
          )}
          {comprasQueBloquean.map((compra) => (
            <li
              key={compra.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
            >
              <span className="text-sm text-foreground">{compra.numero}</span>
              {puedeDesvincular && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isLoading={desvincularMutation.isPending}
                  onClick={() => desvincularMutation.mutate(compra.id)}
                >
                  Desvincular
                </Button>
              )}
            </li>
          ))}
        </ul>

        {puedeVincular && (
          <form onSubmit={submit} className="flex items-end gap-2" noValidate>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="compra-a-vincular" className="text-xs font-medium text-foreground">
                Vincular compra
              </label>
              <Select
                id="compra-a-vincular"
                value={compraSeleccionada}
                onChange={(e) => setCompraSeleccionada(e.target.value)}
              >
                <option value="">Elegí una compra</option>
                {comprasDisponibles.map((compra) => (
                  <option key={compra.id} value={compra.id}>
                    {compra.numero}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" isLoading={vincularMutation.isPending} disabled={!compraSeleccionada}>
              Vincular
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
