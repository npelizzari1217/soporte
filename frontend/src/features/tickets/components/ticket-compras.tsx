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
import { useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { notifyError } from "@/shared/lib/toast";
import { useCompras } from "@/features/compras/hooks/use-compras";
import { busquedaComprasSchema } from "@/features/compras/schemas";
import {
  useComprasDeTicket,
  useDesvincularCompraDeTicket,
  useVincularCompraATicket,
} from "../hooks/use-compras-de-ticket";
import type { CompraDeTicket, GrupoEstadoCompraVinculada } from "../types";

/** Espera entre la última tecla y la consulta a `GET /compras`. */
const DEMORA_BUSQUEDA_MS = 300;

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
 * Buscador y selector de compras ACTIVAS para vincular. Vive aparte para que `GET /compras` se pida
 * solo cuando se puede vincular: una compra entregada o cancelada no frenaría nada. Quien lo monta
 * dentro de un diálogo lo desmonta al cerrarlo, así que cada apertura arranca con el buscador vacío.
 *
 * Las compras se muestran por su `motivo` (lo que el usuario reconoce) con el `numero` como dato
 * secundario, y se buscan en el servidor por cualquiera de los dos: el listado está paginado, así
 * que filtrar en memoria solo encontraría las de la primera página.
 */
function VincularCompraForm({ ticketId, vinculadas }: { ticketId: string; vinculadas: CompraDeTicket[] }) {
  const [termino, setTermino] = useState("");
  const [compraSeleccionada, setCompraSeleccionada] = useState("");
  const terminoEstable = useDebouncedValue(termino, DEMORA_BUSQUEDA_MS);

  // El mensaje de tope se valida sobre lo tipeado, sin esperar la demora; la consulta usa el término
  // estable y no sale si el servidor lo rechazaría.
  const validacionInmediata = busquedaComprasSchema.safeParse(termino);
  const validacionEstable = busquedaComprasSchema.safeParse(terminoEstable);
  const busqueda =
    validacionEstable.success && validacionEstable.data !== "" ? validacionEstable.data : undefined;

  const comprasQuery = useCompras(
    { estado: "ACTIVAS", ...(busqueda !== undefined && { busqueda }) },
    { enabled: validacionEstable.success },
  );
  const vincularMutation = useVincularCompraATicket(ticketId);
  // Una ya vinculada no se vuelve a ofrecer: el backend la aceptaría sin cambiar nada.
  const yaVinculadas = new Set(vinculadas.map((compra) => compra.id));
  const pagina = comprasQuery.data?.items ?? [];
  const disponibles = pagina.filter((compra) => !yaVinculadas.has(compra.id));
  // La selección solo vale si la compra sigue entre las visibles: vincular algo que el usuario ya
  // no ve en pantalla es vincular a ciegas.
  const seleccionVigente = disponibles.some((compra) => compra.id === compraSeleccionada)
    ? compraSeleccionada
    : "";

  function cambiarTermino(valor: string) {
    setTermino(valor);
    setCompraSeleccionada("");
  }

  // Enter en el buscador NO envía el formulario: el envío implícito vincularía la compra marcada
  // antes de que la lista refleje el término nuevo. Se vincula solo con el botón, o con Enter sobre
  // una opción ya visible.
  function evitarEnvioDesdeBuscador(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seleccionVigente) return;
    vincularMutation.mutate(seleccionVigente, { onSuccess: () => setCompraSeleccionada("") });
  }

  const errorTermino = validacionInmediata.success
    ? undefined
    : validacionInmediata.error.issues[0]?.message;
  const idBuscador = `compra-a-vincular-${ticketId}`;
  const idError = `${idBuscador}-error`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={idBuscador} className="text-xs font-medium text-foreground">
        Vincular compra
      </label>
      <Input
        id={idBuscador}
        type="search"
        autoComplete="off"
        placeholder="Buscar por descripción o número"
        value={termino}
        onChange={(e) => cambiarTermino(e.target.value)}
        onKeyDown={evitarEnvioDesdeBuscador}
        error={errorTermino !== undefined}
        aria-describedby={errorTermino !== undefined ? idError : undefined}
      />
      {errorTermino !== undefined && (
        <p id={idError} className="text-xs text-destructive">
          {errorTermino}
        </p>
      )}

      {errorTermino === undefined && (
        <ResultadosCompras
          nombreGrupo={`${idBuscador}-opcion`}
          cargando={comprasQuery.isLoading}
          fallo={comprasQuery.isError}
          resultados={disponibles}
          enPagina={pagina.length}
          total={comprasQuery.data?.total ?? 0}
          busqueda={busqueda}
          seleccion={seleccionVigente}
          onSeleccionar={setCompraSeleccionada}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={vincularMutation.isPending} disabled={!seleccionVigente}>
          Vincular
        </Button>
      </div>
    </form>
  );
}

interface ResultadosComprasProps {
  /** `name` del grupo de radios; único por ticket, por si conviven dos paneles. */
  nombreGrupo: string;
  cargando: boolean;
  fallo: boolean;
  /** Compras de la página que todavía no están vinculadas. */
  resultados: { id: string; numero: string; motivo: string }[];
  /** Compras que trajo la página, vinculadas incluidas: es lo que se compara contra `total`. */
  enPagina: number;
  total: number;
  busqueda: string | undefined;
  seleccion: string;
  onSeleccionar: (compraId: string) => void;
}

/** Lista de compras encontradas, con sus estados de carga, error y vacío. */
function ResultadosCompras({
  nombreGrupo,
  cargando,
  fallo,
  resultados,
  enPagina,
  total,
  busqueda,
  seleccion,
  onSeleccionar,
}: ResultadosComprasProps) {
  if (cargando) {
    return <p className="text-sm text-muted-foreground" role="status">Buscando compras…</p>;
  }
  if (fallo) {
    return <p className="text-sm text-destructive">No se pudieron cargar las compras.</p>;
  }
  if (resultados.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {busqueda !== undefined
          ? `Ninguna compra activa coincide con «${busqueda}».`
          : "No hay compras activas para vincular."}
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Compras encontradas</legend>
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
        {resultados.map((compra) => (
          <li key={compra.id}>
            <label className="flex cursor-pointer items-baseline gap-2 rounded-lg border border-border p-2 has-[:checked]:border-primary">
              <input
                type="radio"
                name={nombreGrupo}
                value={compra.id}
                checked={seleccion === compra.id}
                onChange={() => onSeleccionar(compra.id)}
              />
              {/* El espacio va FUERA de los `<span>`: dentro, el cálculo del nombre accesible lo
                  recorta y el lector de pantalla lee "Repuesto— COM-0001". */}
              <span className="text-sm text-foreground">{compra.motivo}</span>{" "}
              <span className="text-xs text-muted-foreground">— {compra.numero}</span>
            </label>
          </li>
        ))}
      </ul>
      {total > enPagina && (
        <p className="text-xs text-muted-foreground">
          Se muestran {enPagina} de {total} compras activas. Acote la búsqueda para encontrar el resto.
        </p>
      )}
    </fieldset>
  );
}
