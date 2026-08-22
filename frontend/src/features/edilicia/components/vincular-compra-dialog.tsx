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
 * nunca de seguridad. La autorización real la sostiene el backend:
 * - Vincular exige `EDILICIA:ALTAS` **y** `COMPRAS:LECTURA`, las dos, vía
 *   `@RequiereAcciones` en el controller (WU5.9) — verificado por un test de
 *   autorización HTTP real que probó que sin ese candado server-side un
 *   actor con solo `EDILICIA:ALTAS` vinculaba con éxito (201, no 403).
 * - Desvincular exige `EDILICIA:BORRADO` en el mismo guard (WU5.6).
 * Un `curl` directo sin el `<Can>` (que no existe fuera del navegador) sigue
 * recibiendo 403 si le falta el permiso: la interfaz nunca es el único
 * candado.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import { useCan } from "@/shared/hooks/use-can";
import { useCompras } from "@/features/compras/hooks/use-compras";
import { useDesvincularCompra, useVincularCompra } from "../hooks/use-reparacion-compra-mutations";

export interface VincularCompraDialogProps {
  reparacionId: string;
  numero: string;
  /** Subset mínimo (`id`+`numero`) de las compras que HOY frenan la reparación — sale de `ReparacionListItem.comprasQueBloquean`. */
  comprasQueBloquean: { id: string; numero: string }[];
  trigger: ReactNode;
}

export function VincularCompraDialog({ reparacionId, numero, comprasQueBloquean, trigger }: VincularCompraDialogProps) {
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
  const puedeVincular = useCan("EDILICIA:ALTAS");
  const puedeDesvincular = useCan("EDILICIA:BORRADO");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* El panel se abre con EDILICIA:ALTAS O con EDILICIA:BORRADO, no solo
          con la primera. Cada acción de adentro tiene su propio gate, así que
          abrir no habilita nada: quien solo puede desvincular entra, ve las
          compras vinculadas y su botón Desvincular, y no ve el formulario de
          vincular. Gatear el trigger solo por ALTAS dejaba a ese usuario
          viendo el chip «Bloqueada» sin ninguna forma de sacarlo, aunque el
          backend le permite el DELETE. El chip sigue visible para cualquiera
          con EDILICIA:LECTURA. */}
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
              <Can permiso="EDILICIA:BORRADO">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isLoading={desvincularMutation.isPending}
                  onClick={() => desvincularMutation.mutate(compra.id)}
                >
                  Desvincular
                </Button>
              </Can>
            </li>
          ))}
        </ul>

        <Can permiso="EDILICIA:ALTAS">
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
        </Can>
      </DialogContent>
    </Dialog>
  );
}
