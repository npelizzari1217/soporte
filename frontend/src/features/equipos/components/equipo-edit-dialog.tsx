"use client";

/**
 * EquipoEditDialog — modal de edición de un equipo. Conversión del form que
 * antes vivía inline en `EquipoDetailView` (fix/equipo-edit-modal): el resto de
 * las altas/ediciones de la app abren en popup y esta era la excepción. Recibe
 * el equipo YA cargado por el detalle (evita un segundo GET) y pre-pobla los
 * campos al abrir. Incluye la calculadora de depreciación COMPUESTA (el % no se
 * guarda; solo deriva el valor residual + su fecha sobre el residual previo, o
 * el importe si no hubo cálculo previo). Gate `EQUIPOS:MODIFICACION` lo
 * aplica el caller (`EquipoDetailView`) vía `<Can>`.
 */
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MontoInput } from "@/components/shared/monto-input";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { aFechaInput, hoyFechaCalendario } from "@/shared/lib/formato-fecha";
import { useEditarEquipo } from "../hooks/use-equipo-mutations";
import { useModelosEquipo } from "@/features/modelos-equipo/hooks/use-modelos-equipo";
import { resolverLista } from "@/features/insumos/lib/resolucion-de-catalogo";
import {
  crearEquipoSchema,
  esPorcentajeDepreciacionValido,
  normalizarUbicacion,
  type CrearEquipoFormValues,
} from "../schemas";
import { baseDepreciacion, calcularValorResidual, parseImporte } from "../depreciacion";
import type { EquipoDetalle } from "../types";

/** Nota bajo el select cuando el catálogo de modelos resolvió VACÍO. */
const NOTA_MODELOS_VACIOS = "No hay modelos de equipo cargados. Creá uno desde Admin > Modelos de equipo.";

/**
 * Nota cuando el catálogo NO resolvió. Mensaje distinto del de vacío a
 * propósito (mismo criterio que `insumo-form-dialog.tsx`): decirle "no hay
 * modelos cargados" a alguien cuya query se cayó lo manda a cargar un
 * catálogo que ya existe.
 */
const NOTA_MODELOS_NO_DISPONIBLES = "No se pudieron cargar los modelos de equipo.";

/**
 * El equipo ya cargado que se va a editar. Es obligatorio y no admite `null`:
 * el diálogo no se monta hasta tener el detalle, así que no existe un estado
 * "abierto sin datos" que el componente deba contemplar.
 */
export interface EquipoEditDialogProps {
  equipo: EquipoDetalle;
}

/**
 * Mapea el equipo cargado a los valores del form: ISO (`2026-08-11T00:00:00Z`)
 * → `YYYY-MM-DD` que espera `<input type="date">` vía `aFechaInput`
 * (`Equipo.fechaAdquisicion` / `fechaValoracion` / `fechaValorResidual` son
 * `@db.Date`; estos tres valores alimentan un input, nunca se muestran en
 * pantalla — deduplica el `.slice(0, 10)` open-coded, no cambia el
 * comportamiento, `aFechaInput` ya maneja `null`/`undefined`), y number/null
 * → string vacío.
 */
function equipoAFormValues(equipo: EquipoDetalle): CrearEquipoFormValues {
  return {
    nombre: equipo.nombre,
    numeroSerie: equipo.numeroSerie ?? "",
    marca: equipo.marca ?? "",
    modelo: equipo.modelo ?? "",
    modeloEquipoId: equipo.modeloEquipoId ?? "",
    fechaAdquisicion: aFechaInput(equipo.fechaAdquisicion),
    ubicacion: equipo.ubicacion ?? "",
    importe: equipo.importe != null ? String(equipo.importe) : "",
    fechaValoracion: aFechaInput(equipo.fechaValoracion),
    observaciones: equipo.observaciones ?? "",
    valorResidual: equipo.valorResidual != null ? String(equipo.valorResidual) : "",
    fechaValorResidual: aFechaInput(equipo.fechaValorResidual),
    porcentajeDepreciacion: "",
  };
}

export function EquipoEditDialog({ equipo }: EquipoEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarEquipo(equipo.id);
  const modelosQuery = useModelosEquipo();
  const modelos = modelosQuery.data ?? [];
  // Cuatro estados, molde de `insumo-form-dialog.tsx` (ADR-6 del design de
  // modelos-equipo-catalogo-y-compatibilidad): `=== "CON_ENTRADAS"`, NO
  // `!== "CARGANDO"` — ver el JSDoc de ese archivo para la transición que ese
  // guard rompe.
  const estadoModelos = resolverLista({ entradas: modelosQuery.data, cargando: modelosQuery.isLoading });
  const modelosListos = estadoModelos === "CON_ENTRADAS";

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CrearEquipoFormValues>({ resolver: zodResolver(crearEquipoSchema) });

  // Un `<select>` nativo no puede mostrar un valor cuya `<option>` todavía no
  // existe: si el catálogo resuelve DESPUÉS de abrir el diálogo, el DOM cae al
  // placeholder mientras react-hook-form conserva el valor guardado del
  // equipo en su store. Reaplicarlo cuando la lista resuelve evita ese salto
  // silencioso — mismo criterio que `insumo-form-dialog.tsx:138-148`.
  useEffect(() => {
    if (!open || !modelosListos) return;
    setValue("modeloEquipoId", equipo.modeloEquipoId ?? "");
  }, [open, modelosListos, equipo.modeloEquipoId, setValue]);

  const modeloEquipoIdActual = watch("modeloEquipoId");
  const conModeloDeCatalogo = !!modeloEquipoIdActual;

  const importeActual = watch("importe");
  const valorResidualActual = watch("valorResidual");
  const porcentajeActual = watch("porcentajeDepreciacion");
  // Depreciación COMPUESTA: la base es el valor residual actual (si ya hubo un
  // cálculo previo) o, si no, el importe original.
  const base = baseDepreciacion(parseImporte(importeActual), parseImporte(valorResidualActual));
  const baseEsResidual = parseImporte(valorResidualActual) !== null;
  const puedeAplicar = base !== null && esPorcentajeDepreciacionValido(porcentajeActual);

  /**
   * Aplica el % de depreciación sobre la base (valor residual actual o importe):
   * setea el nuevo valor residual (derivado) + fecha = hoy (editable).
   */
  function aplicarDepreciacion() {
    const porcentajeTexto = getValues("porcentajeDepreciacion");
    const baseActual = baseDepreciacion(
      parseImporte(getValues("importe")),
      parseImporte(getValues("valorResidual")),
    );
    // Guarda defensiva, no un camino silencioso alcanzable en uso normal: el
    // botón "Aplicar" que dispara esta función solo se habilita cuando
    // `puedeAplicar` (mismos dos criterios) ya dio true.
    if (baseActual === null || !esPorcentajeDepreciacionValido(porcentajeTexto)) return;
    const porcentaje = parseImporte(porcentajeTexto);
    if (porcentaje === null) return;
    setValue("valorResidual", String(calcularValorResidual(baseActual, porcentaje)), {
      shouldValidate: true,
    });
    setValue("fechaValorResidual", hoyFechaCalendario(), { shouldValidate: true });
  }

  function handleOpenChange(next: boolean) {
    // Pre-poblar con los valores actuales cada vez que se abre → form fresco.
    if (next) reset(equipoAFormValues(equipo));
    setOpen(next);
  }

  function submit(values: CrearEquipoFormValues) {
    // PATCH con formulario pre-poblado: un campo que quedó vacío = el usuario lo
    // limpió → se manda `null` (el backend distingue null=limpiar de undefined=mantener).
    //
    // Con un modelo de catálogo elegido, `marca`/`modelo` de texto libre viajan
    // `null` sin importar lo que quedó en el store: ADR-4 del design — el
    // enclavamiento ya los vació A LA VISTA al seleccionar, este PATCH solo
    // confirma esa limpieza contra el backend.
    const conModeloElegido = !!values.modeloEquipoId;
    editarMutation.mutate(
      {
        nombre: values.nombre,
        numeroSerie: values.numeroSerie || null,
        marca: conModeloElegido ? null : values.marca || null,
        modelo: conModeloElegido ? null : values.modelo || null,
        modeloEquipoId: values.modeloEquipoId || null,
        fechaAdquisicion: values.fechaAdquisicion || null,
        ubicacion: values.ubicacion ? normalizarUbicacion(values.ubicacion) : null,
        importe: parseImporte(values.importe),
        fechaValoracion: values.fechaValoracion || null,
        observaciones: values.observaciones || null,
        valorResidual: parseImporte(values.valorResidual),
        fechaValorResidual: values.fechaValorResidual || null,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar equipo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="editar-equipo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="editar-equipo-serie" error={!!errors.numeroSerie} {...register("numeroSerie")} />
            {errors.numeroSerie && (
              <p role="alert" className="text-sm text-destructive">
                {errors.numeroSerie.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-marca" className="text-sm font-medium text-foreground">
              Marca
            </label>
            <Input
              id="editar-equipo-marca"
              error={!!errors.marca}
              disabled={conModeloDeCatalogo}
              {...register("marca")}
            />
            {errors.marca && (
              <p role="alert" className="text-sm text-destructive">
                {errors.marca.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-modelo" className="text-sm font-medium text-foreground">
              Modelo
            </label>
            <Input
              id="editar-equipo-modelo"
              error={!!errors.modelo}
              disabled={conModeloDeCatalogo}
              {...register("modelo")}
            />
            {errors.modelo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modelo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-modelo-equipo" className="text-sm font-medium text-foreground">
              Modelo de catálogo
            </label>
            <Select
              id="editar-equipo-modelo-equipo"
              error={!!errors.modeloEquipoId}
              disabled={!modelosListos}
              defaultValue=""
              {...register("modeloEquipoId", {
                onChange: (e) => {
                  // Quitarlo (valor vacío) NO borra nada — ADR-4: el vaciado
                  // solo dispara al ELEGIR un modelo, nunca al deseleccionar.
                  // Quitar el modelo rehabilita los campos SIN restituir el
                  // texto: quedan vacíos, hay que retipearlos.
                  if (!e.target.value) return;
                  setValue("marca", "", { shouldValidate: true });
                  setValue("modelo", "", { shouldValidate: true });
                },
              })}
            >
              <option value="">Sin modelo de catálogo</option>
              {modelos.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>
                  {modelo.marca} {modelo.modelo}
                  {modelo.activo ? "" : " (deshabilitado)"}
                </option>
              ))}
            </Select>
            {estadoModelos === "VACIA" && <p className="text-xs text-muted-foreground">{NOTA_MODELOS_VACIOS}</p>}
            {estadoModelos === "NO_DISPONIBLE" && (
              <p className="text-xs text-muted-foreground">{NOTA_MODELOS_NO_DISPONIBLES}</p>
            )}
            {errors.modeloEquipoId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modeloEquipoId.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-fecha" className="text-sm font-medium text-foreground">
              Fecha de adquisición
            </label>
            <Input id="editar-equipo-fecha" type="date" {...register("fechaAdquisicion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-ubicacion" className="text-sm font-medium text-foreground">
              Ubicación
            </label>
            <Input
              id="editar-equipo-ubicacion"
              className="uppercase placeholder:normal-case"
              placeholder="Texto libre (se guarda en mayúscula)"
              error={!!errors.ubicacion}
              {...register("ubicacion")}
            />
            {errors.ubicacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.ubicacion.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-importe" className="text-sm font-medium text-foreground">
              Importe (valor del equipo)
            </label>
            <Controller
              name="importe"
              control={control}
              render={({ field }) => (
                <MontoInput
                  id="editar-equipo-importe"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!errors.importe}
                />
              )}
            />
            {errors.importe && (
              <p role="alert" className="text-sm text-destructive">
                {errors.importe.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-fecha-valoracion" className="text-sm font-medium text-foreground">
              Fecha de valoración
            </label>
            <Input id="editar-equipo-fecha-valoracion" type="date" {...register("fechaValoracion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-observaciones" className="text-sm font-medium text-foreground">
              Observaciones
            </label>
            <Textarea id="editar-equipo-observaciones" rows={3} {...register("observaciones")} />
          </div>

          {/* Depreciación: el % NO se guarda; solo deriva el valor residual + su fecha. */}
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Depreciación</p>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="editar-equipo-porcentaje" className="text-sm font-medium text-foreground">
                  % de depreciación
                </label>
                <Input
                  id="editar-equipo-porcentaje"
                  type="number"
                  step="0.01"
                  min="0"
                  max="999.99"
                  error={!!errors.porcentajeDepreciacion}
                  {...register("porcentajeDepreciacion")}
                />
              </div>
              <Button type="button" variant="outline" disabled={!puedeAplicar} onClick={aplicarDepreciacion}>
                Aplicar
              </Button>
            </div>
            {errors.porcentajeDepreciacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.porcentajeDepreciacion.message}
              </p>
            )}
            {base !== null && (
              <p className="text-xs text-muted-foreground">
                Se deprecia sobre {baseEsResidual ? "el valor residual actual" : "el importe"}: $
                {formatearNumeroEsAr(base)}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="editar-equipo-valor-residual" className="text-sm font-medium text-foreground">
                Valor residual
              </label>
              <Controller
                name="valorResidual"
                control={control}
                render={({ field }) => (
                  <MontoInput
                    id="editar-equipo-valor-residual"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={!!errors.valorResidual}
                  />
                )}
              />
              {errors.valorResidual && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.valorResidual.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="editar-equipo-fecha-residual" className="text-sm font-medium text-foreground">
                Fecha del valor residual
              </label>
              <Input id="editar-equipo-fecha-residual" type="date" {...register("fechaValorResidual")} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
