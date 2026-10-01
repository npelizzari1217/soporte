"use client";

/**
 * MovimientoSalidaDialog — registra una SALIDA en la bitácora de un
 * insumo (`POST /insumos/:insumoId/movimientos/salida`). Gate `INSUMOS:ALTAS`
 * aplicado por el CALLER (mismo criterio que el resto de los diálogos del
 * repo, y que `MovimientoEntradaDialog`) — este componente no se auto-gatea.
 *
 * Envuelve el `MovimientoInsumoDialog` compartido (`movimiento-insumo-dialog.tsx`
 * — ver su JSDoc para el porqué de la extracción): acá vive el `useForm` con
 * `registrarSalidaInsumoSchema`, la mutación de baja y la ÚNICA precondición
 * de estado que le corresponde a esta puerta.
 *
 * **La salida NO exige el insumo habilitado.** El JSDoc del controller
 * (`MovimientosInsumoController.registrarSalida`) es explícito: la entrada es
 * la ÚNICA de las tres operaciones que lo exige. Copiar el
 * `disabled={!activo}` de `MovimientoEntradaDialog` acá sería un bug: un
 * insumo deshabilitado igual puede necesitar que se saque lo que queda.
 *
 * **La precondición que SÍ corresponde espejar acá es el STOCK.** Con
 * `stockDisponible` en `0` no hay salida posible: el trigger se deshabilita
 * con un `title` que lo explica —mismo mecanismo `disabled` + `title` que
 * `ItemEliminarControl`/`ItemDecisionActions` (`features/compras`)—. Con
 * stock disponible, la cantidad no puede superarlo: `registrarSalidaInsumoSchema`
 * agrega ese tope sobre `registrarMovimientoInsumoSchema` para dar feedback
 * inmediato en el form, sin viaje al servidor.
 *
 * `stockDisponible: undefined` (la consulta de stock —`useStockInsumo`— sigue
 * en vuelo o falló) NO se trata como `0` en ningún lado de este componente:
 * ni en el trigger ni en el schema. El insumo puede sacarse de existencia
 * DESPUÉS de que el diálogo ya está abierto con un `stockDisponible`
 * suficiente al montar —es una carrera, no el camino normal—, así que el 422
 * de `StockInsuficienteError` sigue manejándose como backstop (ver el test
 * homónimo en el archivo de test).
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegistrarSalidaInsumo, construirMovimientoInsumoDto } from "../hooks/use-insumo-mutations";
import { registrarSalidaInsumoSchema, type RegistrarMovimientoInsumoFormValues } from "../schemas";
import { useStockInsumo } from "../hooks/use-stock-insumo";
import { useSeleccionUnidad } from "../hooks/use-seleccion-unidad";
import { SelectorUnidad } from "./selector-unidad";
import { CondicionStockSelector } from "./condicion-stock-selector";
import { useSelectorCondicion } from "../hooks/use-selector-condicion";
import { construirNotaEquiposNoDisponibles, MovimientoInsumoDialog } from "./movimiento-insumo-dialog";

export interface MovimientoSalidaDialogProps {
  insumoId: string;
  /**
   * Stock vigente del insumo (`useStockInsumo(insumoId).data?.stock`).
   * `undefined` mientras esa consulta está en vuelo o falló — ver el JSDoc de
   * módulo: NO se asume `0` en ese caso, ni acá ni en el schema.
   */
  stockDisponible: number | undefined;
}

/** `title` del trigger cuando no hay existencia para sacar. */
const MOTIVO_SALIDA_DESHABILITADA = "No hay existencia disponible: no se pueden registrar salidas.";

/** Párrafo bajo el select de equipo cuando `GET /equipos` devuelve 403. */
const NOTA_EQUIPOS_NO_DISPONIBLES = construirNotaEquiposNoDisponibles("la salida");

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @param stockDisponible Stock vigente; con `0` el trigger queda deshabilitado, con `undefined` no se lo trata como `0`.
 * @returns El diálogo de baja de una salida, con su trigger propio.
 */
export function MovimientoSalidaDialog({ insumoId, stockDisponible }: MovimientoSalidaDialogProps) {
  const [open, setOpen] = useState(false);
  const condicion = useSelectorCondicion(insumoId);
  const registrarMutation = useRegistrarSalidaInsumo(insumoId);
  const stockQuery = useStockInsumo(insumoId, { refetchOnMount: false });
  // Un insumo `SERIE` saca UNA pieza elegida por serial: cantidad fija en 1 y sin `condicion`.
  const esSerie = stockQuery.data?.seguimiento === "SERIE";
  const seleccion = useSeleccionUnidad(insumoId, esSerie, "salida");
  const salidaDeshabilitada = stockDisponible !== undefined && stockDisponible <= 0;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RegistrarMovimientoInsumoFormValues>({
    // Recalculado en CADA render, mismo criterio que
    // `configurarCorreoSchema(yaConfigurado)` (`ConfigurarCorreoDialog`): el
    // tope de stock tiene que reflejar el `stockDisponible` vigente, no el
    // que tenía la primera vez que el componente se montó.
    resolver: zodResolver(registrarSalidaInsumoSchema(stockDisponible)),
  });

  useEffect(() => {
    if (esSerie) setValue("cantidad", 1 as never);
  }, [esSerie, setValue]);

  // Único dueño de la limpieza del formulario: cierra y resetea juntos,
  // sin importar si lo dispara el éxito de la mutación o Radix (Escape/
  // overlay/X) a través de `onOpenChange`.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      condicion.reiniciar();
      seleccion.reiniciar();
    }
  }

  function submit(values: RegistrarMovimientoInsumoFormValues) {
    const unidadId = seleccion.validar();
    if (unidadId === null) return;
    const dto = construirMovimientoInsumoDto({
      ...values,
      condicion: esSerie ? undefined : condicion.paraEnviar,
    });
    registrarMutation.mutate(unidadId ? { ...dto, unidadId } : dto, {
      onSuccess: () => handleOpenChange(false),
      // La pieza pudo tomarla otra operación: se vuelve a pedir la lista y el toast da el motivo.
      onError: seleccion.refrescar,
    });
  }

  return (
    <MovimientoInsumoDialog
      open={open}
      onOpenChange={handleOpenChange}
      titulo="Registrar salida"
      idPrefijo="salida"
      variant="outline"
      deshabilitado={salidaDeshabilitada}
      motivoDeshabilitado={MOTIVO_SALIDA_DESHABILITADA}
      notaEquiposNoDisponibles={NOTA_EQUIPOS_NO_DISPONIBLES}
      isPending={registrarMutation.isPending}
      onSubmit={handleSubmit(submit)}
      registroCantidad={register("cantidad")}
      errorCantidad={errors.cantidad}
      registroMotivo={register("motivo")}
      errorMotivo={errors.motivo}
      registroEquipo={register("equipoId")}
      registroSector={register("sectorId")}
      cantidadFija={esSerie}
      camposAdicionales={
        esSerie ? (
          <SelectorUnidad
            id="salida-unidad"
            seleccion={seleccion}
            nota="La salida deja la pieza como entregada."
          />
        ) : (
          <CondicionStockSelector id="salida-condicion" selector={condicion} />
        )
      }
    />
  );
}
