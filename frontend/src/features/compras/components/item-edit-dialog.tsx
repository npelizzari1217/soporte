"use client";

/**
 * ItemEditDialog — edita un ítem de compra (§4.2/§4.4, S12-S14). PIEZA
 * AUTÓNOMA (PR-26), sin cablear a `compra-detail-view.tsx` (reparto del
 * batch — ver `item-create-dialog.tsx`).
 *
 * **Congelamiento (S13/S14), sin re-implementar la máquina de estados**:
 * `item.estadoAprobacion` YA es un campo calculado por el backend — este
 * componente SOLO lo compara por igualdad (`!== "PENDIENTE"`) para decidir
 * qué mostrar/enviar, nunca agrega/reinterpreta la tabla de verdad. Cuando
 * el ítem está decidido (APROBADO o RECHAZADO, S13): `cantidad`/`monto`/
 * `moneda` se deshabilitan Y se OMITEN del PATCH (PATCH semántico —
 * `undefined` no toca el campo). Enviarlos igual, aunque sin cambios,
 * dispararía `ItemCompraCongeladoError` en el backend: la regla es "el
 * campo llegó en el body", no "el valor cambió". `descripcion`/
 * `proveedor`/`fechaCotizacion`/`observaciones` siguen editables (S14) y
 * SIEMPRE se envían.
 *
 * **El insumo es un TERCER grupo** (insumos-entrega-3), y no cae ni en el
 * congelado ni en el libre: el dominio lo bloquea con su propio guard, cuya
 * única condición es `cantidadRecibida > 0`. Con el ítem decidido pero todavía
 * sin recibir el insumo SIGUE siendo editable, porque declararlo tarde es
 * normal; desde la primera recepción se deshabilita y se OMITE del PATCH.
 *
 * RBAC: gate `COMPRAS:MODIFICACION` aplicado por el CALLER (mismo criterio que
 * `item-create-dialog.tsx`).
 */
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MontoInput } from "@/components/shared/monto-input";
import { useInsumos } from "@/features/insumos/hooks/use-insumos";
import {
  ETIQUETA_INSUMO_FUERA_DE_CATALOGO,
  opcionesDeInsumo,
} from "@/features/insumos/lib/opciones-insumo";
import { conValorFueraDeCatalogo } from "@/shared/lib/opciones-catalogo";
import { useReaplicarAlResolver } from "@/shared/hooks/use-reaplicar-al-resolver";
import { useEditarItemCompra } from "../hooks/use-compra-mutations";
import { aFechaInput } from "@/shared/lib/formato-fecha";
import { editarItemCompraSchema, type EditarItemCompraFormValues } from "../schemas";
import type { EditarItemCompraDto, ItemCompra } from "../types";

export interface ItemEditDialogProps {
  compraId: string;
  item: ItemCompra;
}

export function ItemEditDialog({ compraId, item }: ItemEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarItemCompra(compraId);
  const insumosQuery = useInsumos();
  const decidido = item.estadoAprobacion !== "PENDIENTE";

  // Precondición ÚNICA del insumo, y distinta de `decidido` a propósito: el
  // dominio bloquea la reasignación con `asegurarInsumoReasignable()`, cuya
  // condición es `cantidadRecibida > 0` y nada más. El congelamiento de
  // `cantidad`/`monto`/`moneda` NO alcanza al insumo — declararlo con el ítem ya
  // aprobado y todavía sin recibir es justo cuando hace falta hacerlo—, así que
  // sumar `decidido` acá haría el control más estricto que la regla que espeja.
  const recibido = item.cantidadRecibida > 0;

  const insumoIdVigente = item.insumoId ?? "";
  // Dos caminos distintos por los que el `<select>` se queda sin la `<option>`
  // de su valor vigente, y hacen falta los dos:
  //
  // 1. El insumo tiene BAJA LÓGICA y `GET /insumos` ya no lo trae. Lo cubre
  //    `conValorFueraDeCatalogo`, que exige `isSuccess` porque la ausencia solo
  //    prueba la baja cuando la lista YA resolvió: con el catálogo cargando o
  //    caído, etiquetar sería mentir sobre un insumo que puede seguir vigente.
  //    El insumo DESHABILITADO no entra por acá — sí viene en el catálogo, y
  //    `opcionesDeInsumo` lo marca en su etiqueta.
  // 2. La opción existe pero llega DESPUÉS de que el `<select>` montó. Eso lo
  //    cubre `useReaplicarAlResolver`, más abajo.
  const opcionesInsumo = conValorFueraDeCatalogo(
    opcionesDeInsumo(insumosQuery.data ?? []),
    insumosQuery.isSuccess,
    insumoIdVigente,
    ETIQUETA_INSUMO_FUERA_DE_CATALOGO,
  );

  const defaults: EditarItemCompraFormValues = {
    descripcion: item.descripcion,
    insumoId: insumoIdVigente,
    cantidad: item.cantidad,
    proveedor: item.proveedor,
    monto: item.monto,
    moneda: item.moneda as EditarItemCompraFormValues["moneda"],
    // El backend serializa la fecha con `.toISOString()`; sin normalizar,
    // `<input type="date">` descarta el valor y el campo aparece vacío.
    fechaCotizacion: aFechaInput(item.fechaCotizacion),
    observaciones: item.observaciones ?? "",
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EditarItemCompraFormValues>({
    resolver: zodResolver(editarItemCompraSchema),
    defaultValues: defaults,
  });

  // `open` y no `true`: este diálogo NO se desmonta al cerrarse, así que el hook
  // tiene que rearmarse en cada apertura. Sin esto, abrir con el catálogo
  // todavía cargando deja el `<select>` mostrando "Sin insumo" mientras el
  // formulario conserva el insumo real — se aprueba una cosa y se guarda otra.
  useReaplicarAlResolver(open, insumosQuery.isSuccess, "insumoId", insumoIdVigente, setValue);

  function submit(values: EditarItemCompraFormValues) {
    const dto: EditarItemCompraDto = {
      descripcion: values.descripcion,
      proveedor: values.proveedor,
      fechaCotizacion: values.fechaCotizacion,
      observaciones: values.observaciones || null,
      // Congelado (S13): omitir por completo, no solo deshabilitar el input.
      ...(decidido ? {} : { cantidad: values.cantidad, monto: values.monto, moneda: values.moneda }),
      // Ítem ya recibido: se omite la clave. El guard del dominio dispara por
      // CAMBIO efectivo, así que reenviar el mismo id también pasaría, pero una
      // clave ausente no puede disparar el 422 ni siquiera si el valor del
      // formulario quedó desincronizado. `""` es "sin insumo" y viaja como
      // `null` EXPLÍCITO: con el PATCH semántico, `undefined` no tocaría el
      // campo y el vínculo que el usuario acaba de sacar seguiría puesto.
      ...(recibido ? {} : { insumoId: values.insumoId || null }),
    };
    editarMutation.mutate({ itemId: item.id, dto }, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Resetear al ABRIR precarga los valores ACTUALES (mismo criterio que
        // ComponenteEditDialog): reabrir siempre refleja el ítem vigente.
        if (next) reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Editar ítem">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar ítem</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="item-editar-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
            {errors.descripcion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.descripcion.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-insumo" className="text-sm font-medium text-foreground">
              Insumo (opcional)
            </label>
            <Select id="item-editar-insumo" disabled={recibido} {...register("insumoId")}>
              <option value="">Sin insumo</option>
              {opcionesInsumo.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.nombre}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {recibido
                ? "El insumo no se puede cambiar: el ítem ya recibió mercadería y el stock quedó imputado. Para corregir las existencias, usar un ajuste manual en el módulo de insumos."
                : "Al registrar la recepción de este ítem, el stock del insumo elegido sube solo."}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-cantidad" className="text-sm font-medium text-foreground">
              Cantidad
            </label>
            <Input
              id="item-editar-cantidad"
              type="number"
              step="0.01"
              min="0"
              disabled={decidido}
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
            <label htmlFor="item-editar-proveedor" className="text-sm font-medium text-foreground">
              Proveedor
            </label>
            <Input id="item-editar-proveedor" error={!!errors.proveedor} {...register("proveedor")} />
            {errors.proveedor && (
              <p role="alert" className="text-sm text-destructive">
                {errors.proveedor.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-monto" className="text-sm font-medium text-foreground">
              Monto
            </label>
            <Controller
              name="monto"
              control={control}
              render={({ field }) => (
                <MontoInput
                  id="item-editar-monto"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={decidido}
                  error={!!errors.monto}
                />
              )}
            />
            {errors.monto && (
              <p role="alert" className="text-sm text-destructive">
                {errors.monto.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-moneda" className="text-sm font-medium text-foreground">
              Moneda
            </label>
            <Select id="item-editar-moneda" disabled={decidido} error={!!errors.moneda} {...register("moneda")}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
            {errors.moneda && (
              <p role="alert" className="text-sm text-destructive">
                {errors.moneda.message}
              </p>
            )}
          </div>
          {decidido && (
            <p className="text-xs text-muted-foreground">
              Cantidad, monto y moneda quedan congelados una vez decidido el ítem (S13).
            </p>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-fecha-cotizacion" className="text-sm font-medium text-foreground">
              Fecha de cotización
            </label>
            <Input
              id="item-editar-fecha-cotizacion"
              type="date"
              error={!!errors.fechaCotizacion}
              {...register("fechaCotizacion")}
            />
            {errors.fechaCotizacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaCotizacion.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-editar-observaciones" className="text-sm font-medium text-foreground">
              Observaciones
            </label>
            <Textarea id="item-editar-observaciones" rows={3} {...register("observaciones")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
