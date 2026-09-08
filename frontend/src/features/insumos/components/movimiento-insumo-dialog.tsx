"use client";

/**
 * MovimientoInsumoDialog — pieza PRESENTACIONAL del diálogo que registra un
 * movimiento en la bitácora de un insumo: el chrome del diálogo (trigger,
 * título, formulario) y los cuatro campos que necesita el alta (cantidad,
 * motivo, equipo, sector). No conoce la mutación, el schema ni el `useForm`
 * del caller — eso lo resuelve `MovimientoEntradaDialog`, su único
 * consumidor hoy.
 *
 * Recibe el resultado YA LLAMADO de `register(...)` para cada campo
 * (`UseFormRegisterReturn<"cantidad">` y sus hermanos) en vez de un
 * `register` crudo: son tipos concretos, resueltos por el caller contra su
 * propio `useForm` — este componente no necesita saber nada del tipo del
 * formulario para pintar los campos.
 *
 * `equipoId`/`sectorId` son vínculos de TRAZABILIDAD opcionales, no de stock:
 * "Sin equipo"/"Sin sector" son las opciones por defecto y el payload NUNCA
 * los envía cuando quedan sin elegir — eso lo resuelve
 * `construirMovimientoInsumoDto` (`use-insumo-mutations.ts`) del lado del
 * caller.
 *
 * **Los dos catálogos NO llevan el mismo gate.** `GET /sectores` es lectura
 * abierta (sin `@RequiereAcciones`, `SectoresController` línea ~79). `GET
 * /equipos` SÍ lleva gate propio —`@RequiereAcciones('EQUIPOS:LECTURA')`,
 * `EquiposController` línea ~216— y ese permiso es INDEPENDIENTE del gate que
 * el caller exige para escribir. Un usuario sin `EQUIPOS:LECTURA` recibe 403
 * en `GET /equipos`, y el select lo refleja con
 * `ETIQUETA_EQUIPOS_NO_DISPONIBLES` en vez de degradar en silencio a "no hay
 * equipos cargados" (mismo criterio que `nombreDeUsuario`/`resolverDeCatalogo`
 * de esta misma feature).
 *
 * `open`/`onOpenChange` viven en el caller, que es el ÚNICO dueño de la
 * limpieza del formulario: su `handleOpenChange` (`setOpen` + `reset`
 * condicionado a `!next`) es la misma función que la mutación llama al tener
 * éxito y la que Radix invoca cuando el cierre viene de Escape, el overlay o
 * la X. Este componente solo reenvía `onOpenChange` al `Dialog` de Radix — no
 * decide ni ejecuta ningún reset.
 */
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { useSectores } from "@/features/sectores/hooks/use-sectores";

/**
 * El catálogo de equipos resolvió con error (403 sin `EQUIPOS:LECTURA`, o
 * caída de red — la diferencia no importa acá: no hay nada que reintentar
 * dentro de este diálogo). `isError`, NO `data === undefined`: eso también es
 * cierto mientras la query está en vuelo.
 */
const ETIQUETA_EQUIPOS_NO_DISPONIBLES = "Sin datos de equipos";

/**
 * Arma el párrafo que va bajo el select de equipo cuando `GET /equipos`
 * devuelve 403. Toma la operación con su artículo, tal como se lee en la
 * frase (`"la entrada"`), así el copy vive una sola vez y cada caller solo
 * aporta el nombre de su propia operación.
 *
 * @param operacion La operación con su artículo, tal como se lee en la frase: `"la entrada"`.
 */
export function construirNotaEquiposNoDisponibles(operacion: string): string {
  return (
    "No se pudo cargar el catálogo de equipos. Puede deberse a un permiso faltante o a un " +
    `problema de red — ${operacion} se puede registrar igual, sin vincular un equipo.`
  );
}

export interface MovimientoInsumoDialogProps {
  open: boolean;
  /** Único dueño de la limpieza del form del caller: cierra Y resetea cuando `open` pasa a `false`, sin importar la vía. */
  onOpenChange: (open: boolean) => void;
  /** Texto del trigger y del título del diálogo (mismo texto en los dos). */
  titulo: string;
  /** Prefijo de los `id`/`htmlFor` de cada campo, para que no choquen si dos diálogos de esta familia coexistieran en la misma página. */
  idPrefijo: string;
  /** `true` deshabilita el trigger. */
  deshabilitado?: boolean;
  /** `title` del trigger cuando `deshabilitado` es `true`, explicando por qué. */
  motivoDeshabilitado?: string;
  /** Párrafo completo bajo el select de equipo cuando `GET /equipos` devuelve 403 — cada caller trae su propio copy. */
  notaEquiposNoDisponibles: string;
  /** `mutation.isPending` del caller: controla el spinner del botón "Registrar". */
  isPending: boolean;
  /** `form.handleSubmit(submit)` del caller, ya resuelto. */
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  registroCantidad: UseFormRegisterReturn<"cantidad">;
  errorCantidad?: FieldError;
  registroMotivo: UseFormRegisterReturn<"motivo">;
  errorMotivo?: FieldError;
  registroEquipo: UseFormRegisterReturn<"equipoId">;
  registroSector: UseFormRegisterReturn<"sectorId">;
}

/**
 * @returns El diálogo de una puerta de escritura de la bitácora, con su trigger propio.
 */
export function MovimientoInsumoDialog({
  open,
  onOpenChange,
  titulo,
  idPrefijo,
  deshabilitado = false,
  motivoDeshabilitado,
  notaEquiposNoDisponibles,
  isPending,
  onSubmit,
  registroCantidad,
  errorCantidad,
  registroMotivo,
  errorMotivo,
  registroEquipo,
  registroSector,
}: MovimientoInsumoDialogProps) {
  // Los dos catálogos solo hacen falta DENTRO del diálogo: pedirlos ya con la
  // ficha montada le costaría un 403 innecesario a un usuario de depósito sin
  // `EQUIPOS:LECTURA`, en cada ficha de insumo y no solo cuando abre el
  // diálogo. Mismo criterio que `SubtareasDialog` (`features/edilicia`).
  const equiposQuery = useEquipos(open);
  const sectoresQuery = useSectores(open);
  const equiposNoDisponibles = equiposQuery.isError;

  return (
    // `onOpenChange` es el `handleOpenChange` del caller: reenviarlo tal
    // cual alcanza para que Escape/overlay/X disparen la misma limpieza que
    // el caller ya ejecuta al tener éxito.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={deshabilitado}
          title={deshabilitado ? motivoDeshabilitado : undefined}
        >
          {titulo}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-cantidad`} className="text-sm font-medium text-foreground">
              Cantidad
            </label>
            <Input
              id={`${idPrefijo}-cantidad`}
              type="number"
              step="0.01"
              min="0.01"
              error={!!errorCantidad}
              {...registroCantidad}
            />
            {errorCantidad && (
              <p role="alert" className="text-sm text-destructive">
                {errorCantidad.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-motivo`} className="text-sm font-medium text-foreground">
              Motivo (opcional)
            </label>
            <Textarea
              id={`${idPrefijo}-motivo`}
              rows={3}
              error={!!errorMotivo}
              {...registroMotivo}
            />
            {errorMotivo && (
              <p role="alert" className="text-sm text-destructive">
                {errorMotivo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-equipo`} className="text-sm font-medium text-foreground">
              Equipo (opcional)
            </label>
            <Select
              id={`${idPrefijo}-equipo`}
              defaultValue=""
              disabled={equiposNoDisponibles}
              {...registroEquipo}
            >
              {equiposNoDisponibles ? (
                <option value="">{ETIQUETA_EQUIPOS_NO_DISPONIBLES}</option>
              ) : (
                <>
                  <option value="">Sin equipo</option>
                  {(equiposQuery.data ?? []).map((equipo) => (
                    <option key={equipo.id} value={equipo.id}>
                      {equipo.nombre}
                      {equipo.numeroSerie ? ` (${equipo.numeroSerie})` : ""}
                    </option>
                  ))}
                </>
              )}
            </Select>
            {equiposNoDisponibles && (
              <p className="text-xs text-muted-foreground">{notaEquiposNoDisponibles}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-sector`} className="text-sm font-medium text-foreground">
              Sector (opcional)
            </label>
            <Select id={`${idPrefijo}-sector`} defaultValue="" {...registroSector}>
              <option value="">Sin sector</option>
              {(sectoresQuery.data ?? []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={isPending}>
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
