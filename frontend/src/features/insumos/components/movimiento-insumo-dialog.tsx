"use client";

/**
 * MovimientoInsumoDialog — diálogo PRESENTACIONAL compartido por las TRES
 * puertas de escritura de la bitácora de un insumo: entrada, salida y
 * ajuste. Es la extracción que salió de tener las tres a la vista
 * (`MovimientoEntradaDialog`/`MovimientoSalidaDialog`/`MovimientoAjusteDialog`):
 * mismo `useEquipos(open)`/`useSectores(open)`, mismo branch de
 * `ETIQUETA_EQUIPOS_NO_DISPONIBLES` (select deshabilitado, opción única,
 * párrafo explicativo), y el mismo bloque de JSX de cantidad/motivo/equipo/
 * sector con sus `role="alert"`.
 *
 * **Por qué NO es genérico sobre el shape del formulario.** La tentación
 * obvia era un componente `<TValues extends RegistrarMovimientoInsumoFormValues>`
 * que llamara `useForm<TValues>()` y `register(...)` puertas adentro. Se
 * probó y NO tipa: `register("cantidad")` necesita que `"cantidad"` sea
 * literalmente un miembro de `Path<TValues>`, y `Path<T>` (tipo condicional
 * recursivo de React Hook Form) no se puede resolver contra un parámetro de
 * tipo todavía genérico — ni siquiera con una firma de tipo concreta del otro
 * lado, `UseFormRegister<Extendido>` NO es asignable a
 * `UseFormRegister<Base>` (lo verificado: falta la propiedad del campo
 * agregado, aunque la dirección de la asignación sugiera lo contrario). La
 * única salida sin `as`/cast sin chequear era resolver `useForm` y llamar a
 * `register(...)` donde el tipo SÍ es concreto: en cada CALLER. Por eso este
 * componente recibe el resultado YA LLAMADO de `register(...)` para los
 * cuatro campos que comparten las tres puertas
 * (`UseFormRegisterReturn<"cantidad">` y sus hermanos, que SÍ son tipos
 * concretos, sin generic abierto) en vez de un `register` crudo.
 *
 * Lo que CADA puerta trae distinto queda en manos del CALLER:
 * - `onSubmit`/`isPending`/`registro*`/`error*` — ya resueltos contra el
 *   `useForm` + `schema` + mutación propios de esa puerta.
 * - `deshabilitado`/`motivoDeshabilitado` — la precondición del TRIGGER
 *   (`insumo.activo` en la entrada, el stock en la salida, ninguna en el
 *   ajuste). Este componente no evalúa ninguna precondición de dominio: solo
 *   pinta lo que el caller ya decidió.
 * - `motivoRequerido` — si el rótulo del campo dice "Motivo" o
 *   "Motivo (opcional)". La VALIDACIÓN de si el motivo hace falta vive en el
 *   `schema` de cada caller (`registrarAjusteInsumoSchema` lo exige,
 *   `registrarMovimientoInsumoSchema` no) — este flag es solo el rótulo, para
 *   que no quede desincronizado del schema.
 * - `notaEquiposNoDisponibles` — el párrafo COMPLETO bajo el select de
 *   equipo cuando `GET /equipos` devuelve 403. Lo arma
 *   `construirNotaEquiposNoDisponibles` a partir del nombre de la operación,
 *   que es lo único que cambia entre las tres puertas; la frase tiene un solo
 *   dueño y el componente sigue sin saber cuál de ellas la pidió.
 * - `camposAdicionales` — JSX YA RESUELTO por el caller (con SU `register`
 *   concreto) para insertar antes de "Cantidad". El ajuste lo usa para su
 *   selector de `tipo`; entrada y salida simplemente no lo pasan. Este
 *   componente nunca pregunta "¿soy el de ajuste?" — solo reserva el hueco.
 * - `open`/`onOpenChange` — el estado del diálogo vive en el caller, que es
 *   el ÚNICO dueño de la limpieza del formulario: su `handleOpenChange`
 *   (`setOpen` + `reset` condicionado a `!next`) es la misma función que la
 *   mutación llama al tener éxito (`onSuccess: () => handleOpenChange(false)`)
 *   y la que Radix invoca cuando el cierre viene de Escape, el overlay o la
 *   X. Este componente solo reenvía `onOpenChange` al `Dialog` de Radix — no
 *   decide ni ejecuta ningún reset.
 *
 * `equipoId`/`sectorId` son vínculos de TRAZABILIDAD opcionales, no de stock:
 * "Sin equipo"/"Sin sector" son las opciones por defecto y el payload NUNCA
 * los envía cuando quedan sin elegir — eso lo resuelve `construirDto` de cada
 * caller con `construirMovimientoInsumoDto` (`use-insumo-mutations.ts`).
 *
 * **Los dos catálogos NO llevan el mismo gate.** `GET /sectores` es lectura
 * abierta (sin `@RequiereAcciones`, `SectoresController` línea ~79). `GET
 * /equipos` SÍ lleva gate propio —`@RequiereAcciones('EQUIPOS:LECTURA')`,
 * `EquiposController` línea ~216— y ese permiso es INDEPENDIENTE del gate que
 * cada puerta exige para escribir. Un usuario sin `EQUIPOS:LECTURA` recibe
 * 403 en `GET /equipos`, y el select lo refleja con
 * `ETIQUETA_EQUIPOS_NO_DISPONIBLES` en vez de degradar en silencio a "no hay
 * equipos cargados" (mismo criterio que `nombreDeUsuario`/`resolverDeCatalogo`
 * de esta misma feature).
 */
import type { ReactNode } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
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
 * devuelve 403. Entre las tres puertas lo único que cambia es cómo se nombra
 * la operación —y su género—, así que eso es lo que se parametriza: el resto
 * de la frase vive acá una sola vez y no puede divergir entre puertas.
 *
 * @param operacion La operación con su artículo, tal como se lee en la frase: `"la entrada"`, `"la salida"`, `"el ajuste"`.
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
  /** Texto del trigger y del título del diálogo (mismo texto en los dos, como en las tres puertas). */
  titulo: string;
  /** Prefijo de los `id`/`htmlFor` de cada campo, para que no choquen si dos diálogos de esta familia coexistieran en la misma página. */
  idPrefijo: string;
  /** Variante del botón trigger; cada puerta elige la suya. */
  variant?: ButtonProps["variant"];
  /** `true` deshabilita el trigger. Cada puerta decide su propia precondición de estado (o ninguna, como el ajuste). */
  deshabilitado?: boolean;
  /** `title` del trigger cuando `deshabilitado` es `true`, explicando por qué. */
  motivoDeshabilitado?: string;
  /** `true` muestra el rótulo "Motivo" a secas; `false` (default) agrega "(opcional)". Solo cambia el RÓTULO — la validación real vive en el `schema` del caller. */
  motivoRequerido?: boolean;
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
  /** JSX ya resuelto por el caller (con SU `register` concreto) para insertar antes de "Cantidad". El ajuste lo usa para su selector de `tipo`; entrada y salida no lo pasan. */
  camposAdicionales?: ReactNode;
  /** JSX ya resuelto por el caller para insertar justo después de "Cantidad" (los seriales de un insumo `SERIE`). */
  camposTrasCantidad?: ReactNode;
  /** `true` pide una cantidad entera (insumo `SERIE`): el campo avanza de a 1. */
  cantidadEntera?: boolean;
  /** `true` fija la cantidad en 1 (la pieza elegida): el campo se ve pero no se edita ni se registra. */
  cantidadFija?: boolean;
}

/**
 * @returns El diálogo de una puerta de escritura de la bitácora, con su trigger propio.
 */
export function MovimientoInsumoDialog({
  open,
  onOpenChange,
  titulo,
  idPrefijo,
  variant,
  deshabilitado = false,
  motivoDeshabilitado,
  motivoRequerido = false,
  notaEquiposNoDisponibles,
  isPending,
  onSubmit,
  registroCantidad,
  errorCantidad,
  registroMotivo,
  errorMotivo,
  registroEquipo,
  registroSector,
  camposAdicionales,
  camposTrasCantidad,
  cantidadEntera = false,
  cantidadFija = false,
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
          variant={variant}
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
          {camposAdicionales}

          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-cantidad`} className="text-sm font-medium text-foreground">
              Cantidad
            </label>
            {cantidadFija ? (
              <Input id={`${idPrefijo}-cantidad`} value="1" readOnly disabled />
            ) : (
              <Input
                id={`${idPrefijo}-cantidad`}
                type="number"
                step={cantidadEntera ? "1" : "0.01"}
                min={cantidadEntera ? "1" : "0.01"}
                error={!!errorCantidad}
                {...registroCantidad}
              />
            )}
            {errorCantidad && (
              <p role="alert" className="text-sm text-destructive">
                {errorCantidad.message}
              </p>
            )}
          </div>

          {camposTrasCantidad}

          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefijo}-motivo`} className="text-sm font-medium text-foreground">
              {motivoRequerido ? "Motivo" : "Motivo (opcional)"}
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
