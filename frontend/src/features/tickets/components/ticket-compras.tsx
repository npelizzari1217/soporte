"use client";

/**
 * TicketCompras — compras vinculadas a un ticket de cualquier tipo (odd/ticket-unificado, S1, S4,
 * S5). Lo montan el detalle del ticket (sección «Compras vinculadas») y el panel «Gestionar
 * compras» de la grilla de Edilicia (`VincularCompraDialog`).
 *
 * Quien lo monta garantiza la celda `COMPRAS:LECTURA`: sin ella `GET /tickets/:id/compras`
 * responde 403 (L19, L22), y este componente no debería ni pedirla. `puedeGestionar` es
 * `MODIFICACION` sobre el tipo del ticket: con las dos, el backend acepta vincular y desvincular
 * (S4). Sin `MODIFICACION`, la lista se ve y no hay acciones. Ocultar un botón es comodidad, no
 * control: el backend vuelve a decidir cada operación.
 *
 * Lista todas las vinculadas, también las completadas o canceladas, que ya no bloquean pero se
 * pueden desvincular; la grilla de Edilicia solo conoce las que bloquean (`comprasQueBloquean`).
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { notifyError } from "@/shared/lib/toast";
import { useCompras } from "@/features/compras/hooks/use-compras";
import {
  useComprasDeTicket,
  useDesvincularCompraDeTicket,
  useVincularCompraATicket,
} from "../hooks/use-compras-de-ticket";
import type { CompraDeTicket, GrupoEstadoCompraVinculada } from "../types";

/** Etiqueta del grupo de una compra que ya no bloquea. */
const ETIQUETA_GRUPO: Readonly<Record<GrupoEstadoCompraVinculada, string>> = {
  ACTIVAS: "Activa",
  COMPLETADAS: "Completada",
  CANCELADAS: "Cancelada",
};

export interface TicketComprasProps {
  ticketId: string;
  /** `MODIFICACION` sobre el tipo del ticket. `COMPRAS:LECTURA` lo garantiza quien monta el panel. */
  puedeGestionar: boolean;
}

/**
 * Lista las compras vinculadas al ticket y, con `puedeGestionar`, ofrece vincular y desvincular.
 *
 * @param props Ticket y permiso de gestión.
 * @returns La lista, con su estado de carga, error o vacío.
 */
export function TicketCompras({ ticketId, puedeGestionar }: TicketComprasProps) {
  const comprasQuery = useComprasDeTicket(ticketId);
  const desvincularMutation = useDesvincularCompraDeTicket(ticketId);
  const vinculadas = comprasQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {comprasQuery.isLoading && <TableSkeleton rows={2} columns={1} />}
      {comprasQuery.isError && (
        <ErrorState
          message="No se pudieron cargar las compras vinculadas."
          onRetry={() => comprasQuery.refetch().catch(notifyError)}
        />
      )}
      {comprasQuery.isSuccess && vinculadas.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin compras vinculadas.</p>
      )}
      {vinculadas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {vinculadas.map((compra) => (
            <li
              key={compra.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
            >
              <div className="flex items-center gap-2">
                <Link href={`/compras/${compra.id}`} className="text-sm font-medium text-foreground underline">
                  {compra.numero}
                </Link>
                {compra.bloquea ? (
                  <Badge variant="warning">Bloquea</Badge>
                ) : (
                  <Badge variant="secondary">{ETIQUETA_GRUPO[compra.grupo]}</Badge>
                )}
              </div>
              {puedeGestionar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Desvincular ${compra.numero}`}
                  isLoading={desvincularMutation.isPending && desvincularMutation.variables === compra.id}
                  onClick={() => desvincularMutation.mutate(compra.id)}
                >
                  Desvincular
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeGestionar && <VincularCompraForm ticketId={ticketId} vinculadas={vinculadas} />}
    </div>
  );
}

/**
 * Selector de compras ACTIVAS para vincular. Vive aparte para que `GET /compras` se pida solo
 * cuando se puede vincular: una compra entregada o cancelada no frenaría nada.
 */
function VincularCompraForm({ ticketId, vinculadas }: { ticketId: string; vinculadas: CompraDeTicket[] }) {
  const [compraSeleccionada, setCompraSeleccionada] = useState("");
  const comprasQuery = useCompras({ estado: "ACTIVAS" });
  const vincularMutation = useVincularCompraATicket(ticketId);
  // Una ya vinculada no se vuelve a ofrecer: el backend la aceptaría sin cambiar nada.
  const yaVinculadas = new Set(vinculadas.map((compra) => compra.id));
  const disponibles = (comprasQuery.data?.items ?? []).filter((compra) => !yaVinculadas.has(compra.id));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compraSeleccionada) return;
    vincularMutation.mutate(compraSeleccionada, { onSuccess: () => setCompraSeleccionada("") });
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2" noValidate>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`compra-a-vincular-${ticketId}`} className="text-xs font-medium text-foreground">
          Vincular compra
        </label>
        <Select
          id={`compra-a-vincular-${ticketId}`}
          value={compraSeleccionada}
          onChange={(e) => setCompraSeleccionada(e.target.value)}
        >
          <option value="">Seleccionar una compra</option>
          {disponibles.map((compra) => (
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
  );
}
