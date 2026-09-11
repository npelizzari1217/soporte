"use client";

/**
 * InsumoFormDialog — crear/editar un `Insumo` del catálogo del inquilino
 * (`POST /insumos`, `PATCH /insumos/:id`), gate `AdminClienteGuard` en el
 * backend. Mismo patrón que `familia-insumo-form-dialog.tsx`/
 * `unidad-medida-form-dialog.tsx`: un solo diálogo combinado create/edit, con
 * `valoresVigentes` recalculado en CADA render (NO memoizado) y
 * `reset(valoresVigentes)` al abrir — el trigger vive montado en la ficha o
 * en el listado desde el primer pintado, y sin esto reabrirlo mostraría el
 * snapshot del primer render, no el dato vigente.
 *
 * SCOPE recortado a propósito (decisión del dueño del repo): `nombre`,
 * `familiaId`, `unidadMedidaId`, `stockMinimo` (opcional). Sin campos para
 * `codigosAlternativos`/`compatibilidad` — se gestionan desde la ficha en una
 * entrega posterior, y el body de POST/PATCH los omite siempre (ver el
 * JSDoc de `use-insumo-abm-mutations.ts`).
 *
 * **El código NO es un campo del formulario (issue #166).** El #162 lo dejaba
 * como un `<input>` opcional; el dueño pidió reemplazarlo por una ETIQUETA:
 * en el alta aparece vacía —"se genera al guardar"—, y en la edición muestra
 * el código real pero sin forma de tocarlo. La diferencia no es cosmética: un
 * input deshabilitado sigue pareciendo un campo del formulario que es tuyo
 * pero está temporalmente bloqueado; una etiqueta comunica que el código no
 * es del usuario, es del sistema. Por eso no se registra con
 * `react-hook-form` ni viaja en ningún DTO — ver `CreateInsumoDto`/
 * `EditInsumoDto` en `types.ts`, que ya no lo declaran.
 *
 * Gate de ESCRITURA: este componente NO se auto-gatea — el CALLER decide con
 * `<SoloAdminCliente>` (mismo criterio que el resto de los diálogos del
 * repo), porque el listado/la ficha de insumos son de lectura abierta y solo
 * el trigger de escritura tiene que desaparecer para quien no es admin.
 *
 * `familiaId`/`unidadMedidaId` salen de `useFamiliasInsumo()`/
 * `useUnidadesMedida()` (hooks ya existentes, reusados sin reimplementar).
 * Los dos catálogos pueden venir VACÍOS —es la situación real de producción
 * hoy—: en ese caso el `<select>` correspondiente queda deshabilitado con una
 * nota que manda a cargar el catálogo primero, en vez de dejar dos selects
 * vacíos sin explicación. CADA nota apunta a SU pantalla: las familias se
 * administran en Admin > Insumos y las unidades en Admin > Unidades (issue
 * #156). Mandar a la pantalla equivocada es peor que no poner nota: es el
 * callejón sin salida que ese issue existe para cerrar.
 *
 * Las DESHABILITADAS se listan igual, marcadas en la etiqueta: nunca se
 * eliminan (RESTRICT en el FK de `insumos`), así que ocultarlas dejaría sin
 * opción a un insumo que YA apunta a una — la clase de defecto "select con
 * valor fuera de catálogo" del `AGENTS.md`, aplicada a un catálogo que solo
 * se deshabilita, no se borra.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { useCrearInsumo, useEditarInsumo } from "../hooks/use-insumo-abm-mutations";
import { resolverLista } from "../lib/resolucion-de-catalogo";
import { insumoSchema, type InsumoFormValues } from "../schemas";
import type { CreateInsumoDto, EditInsumoDto, Insumo } from "../types";

export interface InsumoFormDialogProps {
  trigger: ReactNode;
  insumo?: Insumo;
}

/** Nota bajo el select cuando el catálogo correspondiente resolvió VACÍO. */
const NOTA_FAMILIAS_VACIAS = "No hay familias de insumo cargadas. Creá una desde Admin > Insumos.";
const NOTA_UNIDADES_VACIAS = "No hay unidades de medida cargadas. Creá una desde Admin > Unidades.";

/**
 * Nota cuando el catálogo NO resolvió. Es un mensaje distinto del de vacío a
 * propósito: decirle "no hay familias cargadas" a alguien cuya query se cayó lo
 * manda a cargar un catálogo que ya existe. La ausencia solo prueba que está
 * vacío cuando la lista resolvió.
 */
const NOTA_FAMILIAS_NO_DISPONIBLES = "No se pudieron cargar las familias de insumo.";
const NOTA_UNIDADES_NO_DISPONIBLES = "No se pudieron cargar las unidades de medida.";

export function InsumoFormDialog({ trigger, insumo }: InsumoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!insumo;
  const familiasQuery = useFamiliasInsumo();
  const unidadesQuery = useUnidadesMedida();
  const crearMutation = useCrearInsumo();
  const editarMutation = useEditarInsumo(insumo?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  const familias = familiasQuery.data ?? [];
  const unidades = unidadesQuery.data ?? [];
  // Los cuatro estados salen del helper compartido: un `!isLoading && length === 0`
  // escrito acá colapsaría "se cayó" con "está vacío" —`data` es `undefined` en
  // los dos casos y el `?? []` los aplana— y la pantalla mandaría a cargar un
  // catálogo que ya existe. Es la misma regla que aplican el listado y la ficha.
  const estadoFamilias = resolverLista({ entradas: familiasQuery.data, cargando: familiasQuery.isLoading });
  const estadoUnidades = resolverLista({ entradas: unidadesQuery.data, cargando: unidadesQuery.isLoading });
  // Un `<select>` NATIVO no puede mostrar un valor cuya `<option>` todavía no
  // existe. Los dos catálogos son queries independientes del diálogo: si
  // resuelven DESPUÉS de abrirlo, el DOM cae al placeholder mientras
  // react-hook-form conserva el valor guardado en su store, y el usuario ve
  // "Elegí una familia" pero guarda el valor viejo — sin error y sin log. Por
  // eso hacen falta las dos cosas: el control queda deshabilitado hasta que la
  // lista resuelve, y el valor se reaplica cuando llega.
  // `=== "CON_ENTRADAS"`, NO `!== "CARGANDO"`: son cuatro estados y el guard
  // tiene que enumerar la condición que de verdad habilita el `<select>`, la
  // misma que usan sus `<option>` y su `disabled`. Con `!== "CARGANDO"` el
  // camino CARGANDO -> NO_DISPONIBLE -> CON_ENTRADAS —una query que se cae y
  // se recupera sola por `refetchOnWindowFocus`— disparaba el efecto en
  // NO_DISPONIBLE, cuando las `<option>` todavía no existen, y ya no volvía a
  // dispararse al resolver: el valor guardado nunca se reaplicaba.
  const familiasListas = estadoFamilias === "CON_ENTRADAS";
  const unidadesListas = estadoUnidades === "CON_ENTRADAS";

  // Recalculado en CADA render: ver el JSDoc de arriba.
  const valoresVigentes: InsumoFormValues = insumo
    ? {
        nombre: insumo.nombre,
        familiaId: insumo.familiaId,
        unidadMedidaId: insumo.unidadMedidaId,
        stockMinimo: insumo.stockMinimo ?? undefined,
      }
    : { nombre: "", familiaId: "", unidadMedidaId: "", stockMinimo: undefined };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<InsumoFormValues>({
    resolver: zodResolver(insumoSchema),
    defaultValues: valoresVigentes,
  });

  useEffect(() => {
    if (!open || !familiasListas) return;
    setValue("familiaId", valoresVigentes.familiaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, familiasListas]);

  useEffect(() => {
    if (!open || !unidadesListas) return;
    setValue("unidadMedidaId", valoresVigentes.unidadMedidaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unidadesListas]);

  function submit(values: InsumoFormValues) {
    if (isEdit) {
      // `stockMinimo` es el ÚNICO campo donde `null` viaja a propósito: es la
      // orden explícita de borrar el punto de reposición cuando el usuario
      // limpia el campo (ver el JSDoc de `EditInsumoDto`). Sin `codigo`: no
      // es un campo editable (issue #166).
      const dto: EditInsumoDto = {
        nombre: values.nombre,
        familiaId: values.familiaId,
        unidadMedidaId: values.unidadMedidaId,
        stockMinimo: values.stockMinimo ?? null,
      };
      editarMutation.mutate(dto, { onSuccess: () => setOpen(false) });
      return;
    }

    // En el alta, vacío es AUSENCIA: `stockMinimo` no viaja en el body cuando
    // el campo queda sin completar (ni `undefined` explícito ni `null` — la
    // clave directamente no está). Sin `codigo`: lo autogenera el sistema
    // (issue #166) y el formulario no tiene ningún valor que ofrecer.
    const dto: CreateInsumoDto = {
      nombre: values.nombre,
      familiaId: values.familiaId,
      unidadMedidaId: values.unidadMedidaId,
      ...(values.stockMinimo === undefined ? {} : { stockMinimo: values.stockMinimo }),
    };
    crearMutation.mutate(dto, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            {/*
              Issue #166: el código NO es un input, es una etiqueta. Vacía
              mientras se crea —comunica que el sistema todavía no lo generó,
              no que sea un campo bloqueado que te pertenece— y con el código
              real, sin poder tocarlo, al editar. `id="insumo-codigo"` se
              conserva para que la suite existente siga ubicando el bloque
              con el mismo criterio de siempre.
            */}
            <span id="insumo-codigo-label" className="text-sm font-medium text-foreground">
              Código
            </span>
            <p aria-labelledby="insumo-codigo-label" className="text-sm text-foreground">
              {insumo ? insumo.codigo : <span className="text-muted-foreground">Se genera al guardar</span>}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="insumo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="insumo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="insumo-familia" className="text-sm font-medium text-foreground">
              Familia
            </label>
            <Select
              id="insumo-familia"
              error={!!errors.familiaId}
              disabled={estadoFamilias !== "CON_ENTRADAS"}
              defaultValue=""
              {...register("familiaId")}
            >
              <option value="">Elegí una familia</option>
              {familias.map((familia) => (
                <option key={familia.id} value={familia.id}>
                  {familia.nombre}
                  {familia.activo ? "" : " (deshabilitada)"}
                </option>
              ))}
            </Select>
            {estadoFamilias === "VACIA" && <p className="text-xs text-muted-foreground">{NOTA_FAMILIAS_VACIAS}</p>}
            {estadoFamilias === "NO_DISPONIBLE" && (
              <p className="text-xs text-muted-foreground">{NOTA_FAMILIAS_NO_DISPONIBLES}</p>
            )}
            {errors.familiaId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.familiaId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="insumo-unidad-medida" className="text-sm font-medium text-foreground">
              Unidad de medida
            </label>
            <Select
              id="insumo-unidad-medida"
              error={!!errors.unidadMedidaId}
              disabled={estadoUnidades !== "CON_ENTRADAS"}
              defaultValue=""
              {...register("unidadMedidaId")}
            >
              <option value="">Elegí una unidad de medida</option>
              {unidades.map((unidad) => (
                <option key={unidad.id} value={unidad.id}>
                  {unidad.nombre}
                  {unidad.activo ? "" : " (deshabilitada)"}
                </option>
              ))}
            </Select>
            {estadoUnidades === "VACIA" && <p className="text-xs text-muted-foreground">{NOTA_UNIDADES_VACIAS}</p>}
            {estadoUnidades === "NO_DISPONIBLE" && (
              <p className="text-xs text-muted-foreground">{NOTA_UNIDADES_NO_DISPONIBLES}</p>
            )}
            {errors.unidadMedidaId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.unidadMedidaId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="insumo-stock-minimo" className="text-sm font-medium text-foreground">
              Stock mínimo (opcional)
            </label>
            <Input
              id="insumo-stock-minimo"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.stockMinimo}
              {...register("stockMinimo")}
            />
            {errors.stockMinimo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.stockMinimo.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={mutation.isPending}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
