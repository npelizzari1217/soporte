"use client";

/**
 * VincularCompraDialog — panel de compras que frenan una reparación
 * (sdd/reparacion-bloqueada-por-compra, WU6). Un solo diálogo muestra las
 * compras hoy vinculadas (con acción de desvincular) y un buscador para
 * vincular una compra nueva, que la encuentra por su descripción (`motivo`) o
 * por su número. Hermano de `SubtareasDialog`/`ComentariosDialog`:
 * sin ruta de detalle (ADR-1), disparado por fila en `ReparacionesList`.
 *
 * IMPORTANTE — qué NO hace este componente: los dos `<Can>` de abajo son
 * controles de EXPERIENCIA (ocultan botones a quien no va a poder usarlos),
 * nunca de seguridad. La autorización real la sostiene el backend:
 * - Vincular exige `COMPRAS:LECTURA` en la ruta (`@RequiereAcciones`, WU5.9)
 *   **y** `ALTAS` sobre el tipo de la reparación en el caso de uso
 *   (odd/permisos-por-tipo-ticket, D5 c). El formulario espeja las dos: el
 *   contenedor pasa `puedeVincularEnTipo` y acá se suma la celda de Compras.
 * - Desvincular exige `EDILICIA:BORRADO` en la ruta (WU5.6): es permiso del
 *   módulo, no por tipo (L21).
 * Un `curl` directo sin el `<Can>` (que no existe fuera del navegador) sigue
 * recibiendo 403 si le falta el permiso: la interfaz nunca es el único
 * candado.
 */
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan } from "@/shared/hooks/use-can";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { useCompras } from "@/features/compras/hooks/use-compras";
import { busquedaComprasSchema } from "@/features/compras/schemas";
import { useDesvincularCompra, useVincularCompra } from "../hooks/use-reparacion-compra-mutations";

/** Espera entre la última tecla y la consulta a `GET /compras`. */
const DEMORA_BUSQUEDA_MS = 300;

export interface VincularCompraDialogProps {
  reparacionId: string;
  numero: string;
  /** Subset mínimo (`id`+`numero`) de las compras que HOY frenan la reparación — sale de `ReparacionListItem.comprasQueBloquean`. */
  comprasQueBloquean: { id: string; numero: string }[];
  /** `ALTAS` sobre el tipo del ticket de la reparación (odd/permisos-por-tipo-ticket, D5 c). */
  puedeVincularEnTipo: boolean;
  trigger: ReactNode;
}

/**
 * Panel de compras vinculadas a una reparación.
 *
 * @param props Ver `VincularCompraDialogProps`.
 * @returns El trigger (si el usuario puede vincular o desvincular) y el diálogo.
 */
export function VincularCompraDialog({
  reparacionId,
  numero,
  comprasQueBloquean,
  puedeVincularEnTipo,
  trigger,
}: VincularCompraDialogProps) {
  const [open, setOpen] = useState(false);
  const desvincularMutation = useDesvincularCompra(reparacionId);

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

        {puedeVincular && <VincularCompraForm reparacionId={reparacionId} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Buscador y selector de la compra a vincular. Vive en un componente propio
 * porque Radix desmonta el contenido del diálogo al cerrarlo: cada apertura
 * arranca con el buscador vacío y sin selección, sin un `reset` a mano, y la
 * consulta a `GET /compras` solo corre mientras el panel está abierto.
 *
 * Las compras se muestran por su `motivo` (lo que el usuario reconoce) con el
 * `numero` como dato secundario, y se buscan en el servidor: el listado está
 * paginado, así que filtrar en memoria solo encontraría las de la primera
 * página.
 */
function VincularCompraForm({ reparacionId }: { reparacionId: string }) {
  const [termino, setTermino] = useState("");
  const [compraSeleccionada, setCompraSeleccionada] = useState("");
  const terminoEstable = useDebouncedValue(termino, DEMORA_BUSQUEDA_MS);

  // El mensaje de tope se valida sobre lo tipeado, sin esperar la demora; la
  // consulta usa el término estable y no sale si el servidor lo rechazaría.
  const validacionInmediata = busquedaComprasSchema.safeParse(termino);
  const validacionEstable = busquedaComprasSchema.safeParse(terminoEstable);
  const busqueda =
    validacionEstable.success && validacionEstable.data !== "" ? validacionEstable.data : undefined;

  // `estado: 'ACTIVAS'` (WU6.3): solo tiene sentido ofrecer compras que TODAVÍA
  // pueden frenar algo — una compra ya entregada/cancelada no aporta al selector.
  const comprasQuery = useCompras(
    { estado: "ACTIVAS", ...(busqueda !== undefined && { busqueda }) },
    { enabled: validacionEstable.success },
  );
  const vincularMutation = useVincularCompra(reparacionId);

  const resultados = comprasQuery.data?.items ?? [];
  const total = comprasQuery.data?.total ?? 0;
  // La selección solo vale si la compra sigue entre los resultados visibles:
  // vincular algo que el usuario ya no ve en pantalla es vincular a ciegas.
  const seleccionVigente = resultados.some((compra) => compra.id === compraSeleccionada)
    ? compraSeleccionada
    : "";

  function cambiarTermino(valor: string) {
    setTermino(valor);
    setCompraSeleccionada("");
  }

  // Enter en el buscador NO envía el formulario: el envío implícito vincularía
  // la compra marcada antes de que la lista refleje el término nuevo. Se
  // vincula solo con el botón, o con Enter sobre una opción ya visible.
  function evitarEnvioDesdeBuscador(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seleccionVigente) return;
    vincularMutation.mutate(
      { compraId: seleccionVigente },
      { onSuccess: () => setCompraSeleccionada("") },
    );
  }

  const errorTermino = validacionInmediata.success
    ? undefined
    : validacionInmediata.error.issues[0]?.message;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="buscar-compra-a-vincular" className="text-xs font-medium text-foreground">
        Buscar compra para vincular
      </label>
      <Input
        id="buscar-compra-a-vincular"
        type="search"
        autoComplete="off"
        placeholder="Descripción o número de la compra"
        value={termino}
        onChange={(e) => cambiarTermino(e.target.value)}
        onKeyDown={evitarEnvioDesdeBuscador}
        error={errorTermino !== undefined}
        aria-describedby={errorTermino !== undefined ? "buscar-compra-error" : undefined}
      />
      {errorTermino !== undefined && (
        <p id="buscar-compra-error" className="text-xs text-destructive">
          {errorTermino}
        </p>
      )}

      {errorTermino === undefined && (
        <ResultadosCompras
          cargando={comprasQuery.isLoading}
          fallo={comprasQuery.isError}
          resultados={resultados}
          total={total}
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
  cargando: boolean;
  fallo: boolean;
  resultados: { id: string; numero: string; motivo: string }[];
  total: number;
  busqueda: string | undefined;
  seleccion: string;
  onSeleccionar: (compraId: string) => void;
}

/** Lista de compras encontradas, con sus estados de carga, error y vacío. */
function ResultadosCompras({
  cargando,
  fallo,
  resultados,
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
                name="compra-a-vincular"
                value={compra.id}
                checked={seleccion === compra.id}
                onChange={() => onSeleccionar(compra.id)}
              />
              {/* El espacio va FUERA de los `<span>`: dentro, el cálculo del
                  nombre accesible lo recorta y el lector de pantalla lee
                  "Repuesto— COM-0001". */}
              <span className="text-sm text-foreground">{compra.motivo}</span>{" "}
              <span className="text-xs text-muted-foreground">— {compra.numero}</span>
            </label>
          </li>
        ))}
      </ul>
      {total > resultados.length && (
        <p className="text-xs text-muted-foreground">
          Se muestran {resultados.length} de {total} compras activas. Acote la búsqueda para
          encontrar el resto.
        </p>
      )}
    </fieldset>
  );
}
