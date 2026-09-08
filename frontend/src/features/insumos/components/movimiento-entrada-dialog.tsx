"use client";

/**
 * MovimientoEntradaDialog — registra una ENTRADA en la bitácora de un
 * insumo (`POST /insumos/:insumoId/movimientos/entrada`). Diálogo PRESENTACIONAL:
 * gate `INSUMOS:ALTAS` aplicado por el CALLER (mismo criterio que el resto
 * de los diálogos del repo, ver `EquipoCreateDialog`/`CompraCreateDialog`) —
 * este componente no se auto-gatea.
 *
 * `equipoId`/`sectorId` son vínculos de TRAZABILIDAD opcionales, no de stock:
 * "Sin equipo"/"Sin sector" son las opciones por defecto y el payload NUNCA
 * los envía cuando quedan sin elegir (mismo criterio que
 * `TicketSoporteCreateDialog`).
 *
 * **Los dos catálogos NO llevan el mismo gate.** `GET /sectores` es lectura
 * abierta (sin `@RequiereAcciones`, `SectoresController` línea ~79). `GET
 * /equipos` SÍ lleva gate propio —`@RequiereAcciones('EQUIPOS:LECTURA')`,
 * `EquiposController` línea ~216— y ese permiso es INDEPENDIENTE de
 * `INSUMOS:ALTAS` (`INSUMOS` ni siquiera está en `presets-rol.ts`: se otorga
 * por la matriz editable por tenant). Un usuario con `INSUMOS:ALTAS` y sin
 * `EQUIPOS:LECTURA` recibe 403 en `GET /equipos`, y el select de equipo lo
 * refleja con `ETIQUETA_EQUIPOS_NO_DISPONIBLES` en vez de degradar en
 * silencio a "no hay equipos cargados" (mismo criterio que
 * `nombreDeUsuario`/`resolverDeCatalogo` de esta misma feature).
 *
 * `motivo` es OPCIONAL A PROPÓSITO, incluso para la entrada: que el ajuste lo
 * exija es una regla de negocio del backend (422), no de este formulario —
 * ver el JSDoc de `registrarMovimientoInsumoSchema`.
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
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { useRegistrarEntradaInsumo } from "../hooks/use-insumo-mutations";
import { registrarMovimientoInsumoSchema, type RegistrarMovimientoInsumoFormValues } from "../schemas";

export interface MovimientoEntradaDialogProps {
  insumoId: string;
  /** Estado vigente del insumo (`insumo.activo`); deshabilita el trigger cuando es `false`. */
  activo: boolean;
}

/** `title` del trigger cuando el insumo está deshabilitado. */
const MOTIVO_ENTRADA_DESHABILITADA = "El insumo está deshabilitado: no se pueden registrar entradas.";

/**
 * El catálogo de equipos resolvió con error (403 sin `EQUIPOS:LECTURA`, o
 * caída de red — la diferencia no importa acá: no hay nada que reintentar
 * dentro de este diálogo). NO se usa `equiposQuery.data === undefined` porque
 * eso también es cierto mientras la query está en vuelo; `isError` es lo que
 * distingue "todavía no resolvió" de "resolvió mal", mismo criterio que
 * `stockQuery.isError` en `InsumoDetailView`.
 */
const ETIQUETA_EQUIPOS_NO_DISPONIBLES = "Sin datos de equipos";

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @param activo Estado vigente del insumo; con `false` el trigger queda deshabilitado.
 * @returns El diálogo de alta de una entrada, con su trigger propio.
 */
export function MovimientoEntradaDialog({ insumoId, activo }: MovimientoEntradaDialogProps) {
  const [open, setOpen] = useState(false);
  // Los dos catálogos solo hacen falta DENTRO del diálogo: pedirlos ya con la
  // ficha montada le costaría un 403 innecesario a un usuario de depósito sin
  // `EQUIPOS:LECTURA`, en cada ficha de insumo y no solo cuando abre el
  // diálogo. Mismo criterio que `SubtareasDialog` (`features/edilicia`).
  const equiposQuery = useEquipos(open);
  const sectoresQuery = useSectores(open);
  const registrarMutation = useRegistrarEntradaInsumo(insumoId);
  const equiposNoDisponibles = equiposQuery.isError;
  const entradaDeshabilitada = !activo;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistrarMovimientoInsumoFormValues>({
    resolver: zodResolver(registrarMovimientoInsumoSchema),
  });

  function submit(values: RegistrarMovimientoInsumoFormValues) {
    registrarMutation.mutate(
      {
        cantidad: values.cantidad,
        motivo: values.motivo || undefined,
        equipoId: values.equipoId || undefined,
        sectorId: values.sectorId || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al CERRAR (mismo criterio que `EquipoCreateDialog`, el molde de
        // esta feature): el formulario arranca siempre vacío, nunca con la
        // carga de la vez anterior.
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={entradaDeshabilitada}
          title={entradaDeshabilitada ? MOTIVO_ENTRADA_DESHABILITADA : undefined}
        >
          Registrar entrada
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrada</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="entrada-cantidad" className="text-sm font-medium text-foreground">
              Cantidad
            </label>
            <Input
              id="entrada-cantidad"
              type="number"
              step="0.01"
              min="0.01"
              error={!!errors.cantidad}
              {...register("cantidad")}
            />
            {errors.cantidad && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidad.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entrada-motivo" className="text-sm font-medium text-foreground">
              Motivo (opcional)
            </label>
            <Textarea
              id="entrada-motivo"
              rows={3}
              error={!!errors.motivo}
              {...register("motivo")}
            />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entrada-equipo" className="text-sm font-medium text-foreground">
              Equipo (opcional)
            </label>
            <Select
              id="entrada-equipo"
              defaultValue=""
              disabled={equiposNoDisponibles}
              {...register("equipoId")}
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
              <p className="text-xs text-muted-foreground">
                No se pudo cargar el catálogo de equipos. Puede deberse a un permiso faltante o a un
                problema de red — la entrada se puede registrar igual, sin vincular un equipo.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="entrada-sector" className="text-sm font-medium text-foreground">
              Sector (opcional)
            </label>
            <Select id="entrada-sector" defaultValue="" {...register("sectorId")}>
              <option value="">Sin sector</option>
              {(sectoresQuery.data ?? []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={registrarMutation.isPending}>
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
