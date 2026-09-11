"use client";

/**
 * ComponenteInstalarDialog — WU-4 (sdd/repuestos-instalar-desde-deposito,
 * issue #153): instala un repuesto del depósito en el equipo. A diferencia de
 * `ComponenteCreateDialog`, acá NO hay camino de texto libre — el repuesto es
 * OBLIGATORIO — y no existe ningún select de "Tipo": el tipo del componente
 * se deriva SIEMPRE de la familia del repuesto elegido, en el backend, igual
 * que el camino vinculado de `ComponenteCreateDialog`.
 *
 * En una sola llamada, el backend descuenta 1 unidad de stock del repuesto Y
 * crea el componente, en una única transacción — o pasan las dos cosas, o no
 * pasa ninguna (mecanismo S36). Si el stock no alcanza, el backend rechaza la
 * operación completa con un 422 que este diálogo muestra vía `notifyError`
 * (mismo camino que cualquier otro error de dominio 4xx), sin crear nada.
 *
 * Repuestos ofrecidos: `useInsumos(true, true)`, la MISMA fuente vinculable
 * que `ComponenteCreateDialog` (`soloVinculables: true` — insumo habilitado Y
 * familia habilitada). Sin filtro de stock disponible en el cliente: la
 * autoridad sobre "hay con qué" es el servidor (advisory lock), y filtrar acá
 * de nuevo sería una segunda definición que puede discrepar de la real.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useInstalarComponenteDesdeDeposito } from "../hooks/use-equipo-mutations";
import { useInsumos } from "@/features/insumos/hooks/use-insumos";
import { instalarComponenteSchema, type InstalarComponenteFormValues } from "../schemas";

export interface ComponenteInstalarDialogProps {
  equipoId: string;
}

const EMPTY: InstalarComponenteFormValues = {
  insumoId: "",
  descripcion: "",
  numeroSerie: "",
  capacidad: "",
};

export function ComponenteInstalarDialog({ equipoId }: ComponenteInstalarDialogProps) {
  const [open, setOpen] = useState(false);
  const repuestosQuery = useInsumos(true, true);
  const instalarMutation = useInstalarComponenteDesdeDeposito(equipoId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InstalarComponenteFormValues>({
    resolver: zodResolver(instalarComponenteSchema),
    defaultValues: EMPTY,
  });

  const repuestos = repuestosQuery.data ?? [];

  function submit(values: InstalarComponenteFormValues) {
    instalarMutation.mutate(
      {
        insumoId: values.insumoId,
        descripcion: values.descripcion || undefined,
        numeroSerie: values.numeroSerie || undefined,
        capacidad: values.capacidad || undefined,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR, mismo criterio que `ComponenteCreateDialog`: el
        // formulario arranca siempre vacío.
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Instalar desde depósito
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instalar repuesto desde depósito</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="instalar-componente-repuesto" className="text-sm font-medium text-foreground">
              Repuesto del catálogo
            </label>
            <Select
              id="instalar-componente-repuesto"
              error={!!errors.insumoId}
              {...register("insumoId")}
            >
              <option value="" disabled>
                Elegí un repuesto
              </option>
              {repuestos.map((repuesto) => (
                <option key={repuesto.id} value={repuesto.id}>
                  {repuesto.codigo} — {repuesto.nombre}
                </option>
              ))}
            </Select>
            {errors.insumoId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.insumoId.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="instalar-componente-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="instalar-componente-descripcion" {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="instalar-componente-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="instalar-componente-serie" {...register("numeroSerie")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="instalar-componente-capacidad" className="text-sm font-medium text-foreground">
              Capacidad
            </label>
            <Input id="instalar-componente-capacidad" {...register("capacidad")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={instalarMutation.isPending}>
              Instalar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
