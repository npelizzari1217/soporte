"use client";

/**
 * MovimientoAjusteDialog — registra un AJUSTE (positivo o negativo) en la
 * bitácora de un insumo (`POST /insumos/:insumoId/movimientos/ajuste`).
 *
 * **Gate propio, `INSUMOS:AJUSTAR`, aplicado por el CALLER** — igual que el
 * resto de los diálogos del repo, pero en su PROPIO `<Can>`, NUNCA adentro del
 * `<Can permiso="INSUMOS:ALTAS">` que envuelve entrada y salida
 * (`insumo-detail-view.tsx`). El JSDoc del controller
 * (`MovimientosInsumoController.registrarAjuste`) es explícito: "tener
 * `INSUMOS:ALTAS` no alcanza". Compartir el `<Can>` de arriba dejaría ver
 * este botón a cualquiera que solo pueda cargar la operación cotidiana, que
 * es justo la distinción que separa a esta ruta de las otras dos.
 *
 * Envuelve el `MovimientoInsumoDialog` compartido (`movimiento-insumo-dialog.tsx`
 * — ver su JSDoc para el porqué de la extracción): acá vive el `useForm` con
 * `registrarAjusteInsumoSchema`, la mutación de ajuste y las DOS
 * precondiciones propias de esta puerta.
 *
 * **El insumo NO necesita estar habilitado.** Solo la entrada lo exige
 * (`MovimientosInsumoController.registrarEntrada`) — este diálogo no copia el
 * `disabled={!activo}` de `MovimientoEntradaDialog`.
 *
 * **El motivo acá SÍ es obligatorio, y a diferencia de entrada/salida, SÍ se
 * valida en el cliente.** No es una inconsistencia con el resto del módulo:
 * en entrada y salida el motivo es una regla de negocio genuinamente opcional
 * del dominio, así que no había nada que espejar. Acá el dominio lo EXIGE
 * (`MotivoAjusteRequeridoError`, 422) y esa condición se conoce al tipear, sin
 * ninguna carrera con el servidor de por medio — el criterio que quedó
 * establecido en este módulo es que la precondición CONOCIBLE se espeja en la
 * UI (mismo criterio que `insumo.activo` en la entrada), y el error remoto
 * queda como backstop. `registrarAjusteInsumoSchema` lo mide TRIMEADO, igual
 * que el backend.
 *
 * **El tope de stock aplica SOLO al `AJUSTE_NEGATIVO`.** Un ajuste positivo
 * sube la existencia — nunca puede quedarse corto de nada — así que
 * `registrarAjusteInsumoSchema(stockDisponible)` condiciona ese tope al
 * `tipo` que el usuario eligió en el `<select>` de abajo. Mismo criterio de
 * "no asumir" que `MovimientoSalidaDialog` para `stockDisponible: undefined`
 * (la consulta de stock sigue en vuelo o falló): tampoco acá se lo trata como
 * `0`.
 *
 * El `<select>` de `tipo` arranca en `AJUSTE_POSITIVO` (nunca en blanco): así
 * el usuario siempre tiene una dirección válida elegida y el 400 de "tipo
 * fuera de las dos direcciones del ajuste" del backend nunca es alcanzable
 * desde este formulario. La rama `required_error` del schema queda como
 * defensa del contrato de `registrarAjusteInsumoSchema` en sí (la ejercen los
 * tests de `schemas.test.ts`, llamando el schema directo), no de este
 * `<select>`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/ui/select";
import {
  useRegistrarAjusteInsumo,
  construirMovimientoInsumoDto,
  type RegistrarAjusteInsumoDto,
} from "../hooks/use-insumo-mutations";
import { registrarAjusteInsumoSchema, type RegistrarAjusteInsumoFormValues } from "../schemas";
import type { TipoAjusteInsumo } from "../types";
import { CondicionStockSelector } from "./condicion-stock-selector";
import { useSelectorCondicion } from "../hooks/use-selector-condicion";
import { construirNotaEquiposNoDisponibles, MovimientoInsumoDialog } from "./movimiento-insumo-dialog";

export interface MovimientoAjusteDialogProps {
  insumoId: string;
  /**
   * Stock vigente del insumo (`useStockInsumo(insumoId).data?.stock`).
   * `undefined` mientras esa consulta está en vuelo o falló — NO se trata
   * como `0` acá ni en el schema, mismo criterio que `MovimientoSalidaDialog`.
   */
  stockDisponible: number | undefined;
}

/**
 * Rótulos del `<select>` de dirección. Distintos de
 * `ETIQUETA_TIPO_MOVIMIENTO` de `insumo-detail-view.tsx` a propósito: ese
 * `Record` traduce las CUATRO direcciones para una celda de tabla que ya
 * pasó; este solo ofrece las DOS que el ajuste puede elegir, como opción de
 * un formulario. Coinciden en texto hoy porque describen lo mismo, pero son
 * dos lecturas con propósitos distintos y no hay garantía de que sigan
 * coincidiendo si una de las dos pantallas cambia su copy.
 */
const ETIQUETA_TIPO_AJUSTE: Record<TipoAjusteInsumo, string> = {
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
};

/** Párrafo bajo el select de equipo cuando `GET /equipos` devuelve 403. */
const NOTA_EQUIPOS_NO_DISPONIBLES = construirNotaEquiposNoDisponibles("el ajuste");

/**
 * @param insumoId Insumo cuya existencia se corrige.
 * @param stockDisponible Stock vigente; topa la cantidad SOLO cuando `tipo` es `AJUSTE_NEGATIVO`.
 * @returns El diálogo de ajuste, con su trigger propio.
 */
export function MovimientoAjusteDialog({ insumoId, stockDisponible }: MovimientoAjusteDialogProps) {
  const [open, setOpen] = useState(false);
  const condicion = useSelectorCondicion(insumoId);
  const registrarMutation = useRegistrarAjusteInsumo(insumoId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistrarAjusteInsumoFormValues>({
    // Recalculado en CADA render, mismo criterio que
    // `MovimientoSalidaDialog`: el tope tiene que reflejar el
    // `stockDisponible` vigente, no el que tenía la primera vez que el
    // componente se montó.
    resolver: zodResolver(registrarAjusteInsumoSchema(stockDisponible)),
    defaultValues: { tipo: "AJUSTE_POSITIVO" },
  });

  // Único dueño de la limpieza del formulario: cierra y resetea juntos,
  // sin importar si lo dispara el éxito de la mutación o Radix (Escape/
  // overlay/X) a través de `onOpenChange`.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      condicion.reiniciar();
    }
  }

  function submit(values: RegistrarAjusteInsumoFormValues) {
    const dto: RegistrarAjusteInsumoDto = {
      ...construirMovimientoInsumoDto({ ...values, condicion: condicion.paraEnviar }),
      tipo: values.tipo,
    };
    registrarMutation.mutate(dto, {
      onSuccess: () => handleOpenChange(false),
    });
  }

  return (
    <MovimientoInsumoDialog
      open={open}
      onOpenChange={handleOpenChange}
      titulo="Registrar ajuste"
      idPrefijo="ajuste"
      variant="secondary"
      motivoRequerido
      notaEquiposNoDisponibles={NOTA_EQUIPOS_NO_DISPONIBLES}
      isPending={registrarMutation.isPending}
      onSubmit={handleSubmit(submit)}
      registroCantidad={register("cantidad")}
      errorCantidad={errors.cantidad}
      registroMotivo={register("motivo")}
      errorMotivo={errors.motivo}
      registroEquipo={register("equipoId")}
      registroSector={register("sectorId")}
      camposAdicionales={
        <>
        <div className="flex flex-col gap-1">
          <label htmlFor="ajuste-tipo" className="text-sm font-medium text-foreground">
            Tipo de ajuste
          </label>
          <Select id="ajuste-tipo" error={!!errors.tipo} {...register("tipo")}>
            <option value="AJUSTE_POSITIVO">{ETIQUETA_TIPO_AJUSTE.AJUSTE_POSITIVO}</option>
            <option value="AJUSTE_NEGATIVO">{ETIQUETA_TIPO_AJUSTE.AJUSTE_NEGATIVO}</option>
          </Select>
          {errors.tipo && (
            <p role="alert" className="text-sm text-destructive">
              {errors.tipo.message}
            </p>
          )}
        </div>
        <CondicionStockSelector id="ajuste-condicion" selector={condicion} />
        </>
      }
    />
  );
}
