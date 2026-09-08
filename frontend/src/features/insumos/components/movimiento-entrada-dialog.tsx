"use client";

/**
 * MovimientoEntradaDialog — registra una ENTRADA en la bitácora de un
 * insumo (`POST /insumos/:insumoId/movimientos/entrada`). Gate `INSUMOS:ALTAS`
 * aplicado por el CALLER (mismo criterio que el resto de los diálogos del
 * repo, ver `EquipoCreateDialog`/`CompraCreateDialog`) — este componente no se
 * auto-gatea.
 *
 * Envuelve el `MovimientoInsumoDialog` compartido (`movimiento-insumo-dialog.tsx`,
 * ver su JSDoc): acá vive el `useForm` con `registrarMovimientoInsumoSchema`,
 * la mutación de alta y la precondición de estado de esta puerta.
 *
 * **`activo` refleja `insumo.activo` de la ficha** y deshabilita el trigger
 * —con un `title` que explica por qué— cuando es `false`. El backend exige
 * el insumo HABILITADO solo para la entrada
 * (`MovimientosInsumoController.registrarEntrada`, 422 `InsumoError`); salida
 * y ajuste no llevan esa exigencia, así que este gate no se generaliza a
 * ellos sin volver a revisar sus controllers. Mismo mecanismo `disabled` +
 * `title` que `ItemEliminarControl`/`ItemDecisionActions`
 * (`features/compras`). El insumo puede deshabilitarse con el diálogo YA
 * abierto —es una carrera, no el camino normal—, así que el 422 sigue
 * manejándose como backstop (ver el test homónimo en el archivo de test).
 *
 * `motivo` es OPCIONAL A PROPÓSITO, incluso para la entrada: que el ajuste lo
 * exija es una regla de negocio del backend (422), no de este formulario —
 * ver el JSDoc de `registrarMovimientoInsumoSchema`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegistrarEntradaInsumo, construirMovimientoInsumoDto } from "../hooks/use-insumo-mutations";
import { registrarMovimientoInsumoSchema, type RegistrarMovimientoInsumoFormValues } from "../schemas";
import { construirNotaEquiposNoDisponibles, MovimientoInsumoDialog } from "./movimiento-insumo-dialog";

export interface MovimientoEntradaDialogProps {
  insumoId: string;
  /** Estado vigente del insumo (`insumo.activo`); deshabilita el trigger cuando es `false`. */
  activo: boolean;
}

/** `title` del trigger cuando el insumo está deshabilitado. */
const MOTIVO_ENTRADA_DESHABILITADA = "El insumo está deshabilitado: no se pueden registrar entradas.";

/** Párrafo bajo el select de equipo cuando `GET /equipos` devuelve 403. */
const NOTA_EQUIPOS_NO_DISPONIBLES = construirNotaEquiposNoDisponibles("la entrada");

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @param activo Estado vigente del insumo; con `false` el trigger queda deshabilitado.
 * @returns El diálogo de alta de una entrada, con su trigger propio.
 */
export function MovimientoEntradaDialog({ insumoId, activo }: MovimientoEntradaDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarEntradaInsumo(insumoId);
  const entradaDeshabilitada = !activo;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistrarMovimientoInsumoFormValues>({
    resolver: zodResolver(registrarMovimientoInsumoSchema),
  });

  // Único dueño de la limpieza del formulario: cierra y resetea juntos,
  // sin importar si lo dispara el éxito de la mutación o Radix (Escape/
  // overlay/X) a través de `onOpenChange`.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function submit(values: RegistrarMovimientoInsumoFormValues) {
    registrarMutation.mutate(construirMovimientoInsumoDto(values), {
      onSuccess: () => handleOpenChange(false),
    });
  }

  return (
    <MovimientoInsumoDialog
      open={open}
      onOpenChange={handleOpenChange}
      titulo="Registrar entrada"
      idPrefijo="entrada"
      deshabilitado={entradaDeshabilitada}
      motivoDeshabilitado={MOTIVO_ENTRADA_DESHABILITADA}
      notaEquiposNoDisponibles={NOTA_EQUIPOS_NO_DISPONIBLES}
      isPending={registrarMutation.isPending}
      onSubmit={handleSubmit(submit)}
      registroCantidad={register("cantidad")}
      errorCantidad={errors.cantidad}
      registroMotivo={register("motivo")}
      errorMotivo={errors.motivo}
      registroEquipo={register("equipoId")}
      registroSector={register("sectorId")}
    />
  );
}
